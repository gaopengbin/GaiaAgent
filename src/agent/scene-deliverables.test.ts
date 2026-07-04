import { describe, expect, it } from 'vitest'
import type { SceneState } from './types'
import { buildSceneDeliverablesManifest } from './scene-deliverables'

describe('scene deliverables', () => {
  it('builds a deliverables manifest for scene exports, reports, geojson, and point csv', () => {
    const scene = {
      revision: 12,
      camera: null,
      layers: [],
      labels: [],
      activeObjectRef: null,
      recentObjectRefs: [],
      assets: {
        'asset:schools': {
          ref: 'asset:schools',
          id: 'schools',
          kind: 'asset',
          type: 'tabular',
          name: 'Schools / CSV',
          source: 'import',
          geometryType: 'point',
          featureCount: 1,
          metadata: {
            renderData: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { name: 'School A' },
                  geometry: { type: 'Point', coordinates: [116.1, 39.7] },
                },
              ],
            },
          },
        },
        'asset:schools-buffer': {
          ref: 'asset:schools-buffer',
          id: 'schools-buffer',
          kind: 'asset',
          type: 'analysis-result',
          name: 'Schools buffer',
          source: 'agent',
          geometryType: 'polygon',
          featureCount: 1,
          metadata: {
            analysisType: 'buffer',
            sourceAssetRef: 'asset:schools',
            distanceMeters: 500,
            renderData: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { name: 'Buffer' },
                  geometry: { type: 'Polygon', coordinates: [] },
                },
              ],
            },
          },
        },
        'asset:project-parcels-overlap-redlines': {
          ref: 'asset:project-parcels-overlap-redlines',
          id: 'project-parcels-overlap-redlines',
          kind: 'asset',
          type: 'analysis-result',
          name: 'Project parcel redline overlap screen',
          source: 'agent',
          geometryType: 'polygon',
          featureCount: 1,
          metadata: {
            analysisType: 'polygon_overlap_screen',
            screenType: 'vertex_or_edge_intersection',
            sourceAssetRef: 'asset:project-parcels',
            targetAssetRef: 'asset:redlines',
            totalCandidates: 1,
            totalCandidateAreaSquareMeters: 1234567.89,
            riskLevelCounts: { low: 1, medium: 0, high: 0 },
            exactOverlay: false,
            renderData: {
              type: 'FeatureCollection',
              features: [
                { type: 'Feature', properties: { reviewStatus: 'pending' }, geometry: null },
                { type: 'Feature', properties: { reviewStatus: 'confirmed' }, geometry: null },
                { type: 'Feature', properties: { reviewStatus: 'excluded' }, geometry: null },
              ],
            },
          },
        },
      },
    } satisfies SceneState

    const manifest = buildSceneDeliverablesManifest('session-1', scene, '2026-07-04T00:00:00.000Z')

    expect(manifest.kind).toBe('gaia-agent-deliverables')
    expect(manifest.counts).toMatchObject({
      objects: 3,
      dataAssets: 3,
      analysisResults: 2,
      geojson: 3,
      csv: 3,
      totalDeliverables: 8,
    })
    expect(manifest.items.map((item) => item.format)).toEqual([
      'scene-json',
      'markdown',
      'geojson',
      'geojson',
      'geojson',
      'csv',
      'csv',
      'csv',
    ])
    expect(manifest.items.find((item) => item.id === 'asset:schools:csv')).toMatchObject({
      assetRef: 'asset:schools',
      filenameHint: 'Schools-CSV.csv',
    })
    expect(manifest.items.find((item) => item.id === 'asset:schools-buffer:csv')).toMatchObject({
      source: 'analysis',
      geometryType: 'polygon',
      filenameHint: 'Schools-buffer.csv',
    })
    expect(manifest.items.find((item) => item.id === 'asset:schools-buffer:geojson')).toMatchObject(
      {
        source: 'analysis',
        geometryType: 'polygon',
        description: expect.stringContaining('缓冲半径：500 米'),
      },
    )
    const overlapItem = manifest.items.find(
      (item) => item.id === 'asset:project-parcels-overlap-redlines:geojson',
    )
    expect(overlapItem).toMatchObject({
      source: 'analysis',
      geometryType: 'polygon',
      description: expect.stringContaining('候选边界命中：1'),
    })
    expect(overlapItem?.description).toContain('候选地块面积：1,234,567.89 平方米')
    expect(overlapItem?.description).toContain('风险分布：低 1 / 中 0 / 高 0')
    expect(overlapItem?.description).toContain('复核状态：待复核 1 / 已确认 1 / 已排除 1')
    expect(overlapItem?.reviewSummary).toMatchObject({
      pending: 1,
      confirmed: 1,
      excluded: 1,
      total: 3,
      completed: 2,
    })
    expect(
      manifest.items.find((item) => item.id === 'asset:project-parcels-overlap-redlines:csv'),
    ).toMatchObject({
      source: 'analysis',
      format: 'csv',
      reviewSummary: expect.objectContaining({
        pending: 1,
        confirmed: 1,
        excluded: 1,
      }),
    })
    expect(overlapItem?.description).toContain('精确叠加：否，需人工复核')
  })
})
