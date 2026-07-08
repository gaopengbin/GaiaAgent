import { describe, expect, it } from 'vitest'
import type { SpatialAsset } from '../agent'
import type { PolygonOverlapTriageItem } from './ScenePanel'
import {
  attributeFilterSuggestions,
  buildScenePanelAssetDisplayModel,
  filterPolygonOverlapTriageItems,
  filterScenePanelBusinessOutcomeItems,
  isMeasurableGeoJsonAsset,
  isRenderablePolygonAsset,
  isRenderablePointAsset,
  nearestTargetCandidates,
  polygonOverlapCandidates,
  polygonOverlapReviewOverview,
  polygonOverlapReviewUpdateTargets,
  polygonOverlapRiskOverview,
  polygonOverlapTriageItems,
  scenePanelBusinessOutcomeItems,
  scenePanelDeliverablesReviewPreview,
  sortAssets,
  scenePanelAnalysisSummaryItems,
  spatialJoinCandidates,
} from './ScenePanel'

function asset(
  overrides: Partial<SpatialAsset> & Pick<SpatialAsset, 'ref' | 'id' | 'kind' | 'type'>,
) {
  return {
    visible: true,
    source: 'agent',
    ...overrides,
  } satisfies SpatialAsset
}

describe('buildScenePanelAssetDisplayModel', () => {
  it('folds marker entities into their paired map layer', () => {
    const markerEntity = asset({
      ref: 'entity:marker-1',
      id: 'marker-1',
      kind: 'entity',
      type: 'marker',
      name: '冒烟测试点',
      lastCallId: 'tooluse-1',
    })
    const markerLayer = asset({
      ref: 'layer:marker_1783083754035',
      id: 'marker_1783083754035',
      kind: 'layer',
      type: 'marker',
      name: '冒烟测试点',
      lastCallId: 'tooluse-1',
    })

    const displayModel = buildScenePanelAssetDisplayModel([markerEntity, markerLayer])

    expect(displayModel.assets).toEqual([markerLayer])
    expect(displayModel.foldedAssets).toEqual([markerEntity])
    expect(displayModel.foldedByParentRef).toEqual({
      [markerLayer.ref]: [markerEntity],
    })
  })

  it('keeps independent marker-like layers visible when they are not paired', () => {
    const markerEntity = asset({
      ref: 'entity:marker-1',
      id: 'marker-1',
      kind: 'entity',
      type: 'marker',
      name: '冒烟测试点',
      lastCallId: 'tooluse-1',
    })
    const independentLayer = asset({
      ref: 'layer:marker-business-layer',
      id: 'marker-business-layer',
      kind: 'layer',
      type: 'marker',
      name: '业务标注图层',
      lastCallId: 'tooluse-2',
    })

    const displayModel = buildScenePanelAssetDisplayModel([markerEntity, independentLayer])

    expect(displayModel.assets).toEqual([markerEntity, independentLayer])
    expect(displayModel.foldedAssets).toEqual([])
    expect(displayModel.foldedByParentRef).toEqual({})
  })

  it('does not fold batch marker entities into the first marker layer by shared call id', () => {
    const beijingEntity = asset({
      ref: 'entity:beijing',
      id: 'beijing',
      kind: 'entity',
      type: 'marker',
      name: '北京',
      lastCallId: 'tooluse-batch',
    })
    const guangzhouEntity = asset({
      ref: 'entity:guangzhou',
      id: 'guangzhou',
      kind: 'entity',
      type: 'marker',
      name: '广州',
      lastCallId: 'tooluse-batch',
    })
    const shanghaiEntity = asset({
      ref: 'entity:shanghai',
      id: 'shanghai',
      kind: 'entity',
      type: 'marker',
      name: '上海',
      lastCallId: 'tooluse-batch',
    })
    const beijingLayer = asset({
      ref: 'layer:marker_beijing',
      id: 'marker_beijing',
      kind: 'layer',
      type: 'marker',
      name: '北京',
      lastCallId: 'tooluse-batch',
    })
    const guangzhouLayer = asset({
      ref: 'layer:marker_guangzhou',
      id: 'marker_guangzhou',
      kind: 'layer',
      type: 'marker',
      name: '广州',
      lastCallId: 'tooluse-batch',
    })
    const shanghaiLayer = asset({
      ref: 'layer:marker_shanghai',
      id: 'marker_shanghai',
      kind: 'layer',
      type: 'marker',
      name: '上海',
      lastCallId: 'tooluse-batch',
    })

    const displayModel = buildScenePanelAssetDisplayModel([
      beijingLayer,
      guangzhouLayer,
      shanghaiLayer,
      beijingEntity,
      guangzhouEntity,
      shanghaiEntity,
    ])

    expect(displayModel.assets).toEqual([beijingLayer, guangzhouLayer, shanghaiLayer])
    expect(displayModel.foldedByParentRef).toEqual({
      [beijingLayer.ref]: [beijingEntity],
      [guangzhouLayer.ref]: [guangzhouEntity],
      [shanghaiLayer.ref]: [shanghaiEntity],
    })
  })
})

describe('sortAssets', () => {
  it('prioritizes high-risk polygon overlap analysis results within asset groups', () => {
    const ordinary = asset({
      ref: 'asset:ordinary',
      id: 'ordinary',
      kind: 'asset',
      type: 'vector',
      name: 'A ordinary asset',
    })
    const mediumRisk = asset({
      ref: 'asset:medium',
      id: 'medium',
      kind: 'asset',
      type: 'analysis-result',
      name: 'B medium risk',
      metadata: {
        analysisType: 'polygon_overlap_screen',
        riskLevelCounts: { low: 0, medium: 2, high: 0 },
      },
    })
    const highRisk = asset({
      ref: 'asset:high',
      id: 'high',
      kind: 'asset',
      type: 'analysis-result',
      name: 'C high risk',
      metadata: {
        analysisType: 'polygon_overlap_screen',
        riskLevelCounts: { low: 1, medium: 0, high: 1 },
      },
    })

    expect(sortAssets([ordinary, mediumRisk, highRisk]).map((item) => item.ref)).toEqual([
      'asset:high',
      'asset:medium',
      'asset:ordinary',
    ])
  })
})

describe('nearest analysis display helpers', () => {
  function pointAsset(overrides: Partial<SpatialAsset> = {}) {
    return asset({
      ref: 'asset:schools',
      id: 'schools',
      kind: 'asset',
      type: 'tabular',
      geometryType: 'point',
      metadata: {
        renderTool: 'addGeoJsonLayer',
        renderData: { type: 'FeatureCollection', features: [] },
      },
      ...overrides,
    })
  }

  it('detects renderable point assets', () => {
    expect(isRenderablePointAsset(pointAsset())).toBe(true)
    expect(isRenderablePointAsset(pointAsset({ geometryType: 'polygon' }))).toBe(false)
    expect(isRenderablePointAsset(pointAsset({ metadata: {} }))).toBe(false)
  })

  it('lists other renderable point assets as nearest targets', () => {
    const source = pointAsset()
    const target = pointAsset({ ref: 'asset:hospitals', id: 'hospitals', name: 'Hospitals' })
    const polygon = pointAsset({
      ref: 'asset:districts',
      id: 'districts',
      geometryType: 'polygon',
    })

    expect(nearestTargetCandidates(source, [source, target, polygon])).toEqual([target])
  })
})

describe('measure analysis display helpers', () => {
  function geoJsonAsset(overrides: Partial<SpatialAsset> = {}) {
    return asset({
      ref: 'asset:districts',
      id: 'districts',
      kind: 'asset',
      type: 'vector',
      geometryType: 'polygon',
      metadata: {
        renderTool: 'addGeoJsonLayer',
        renderData: { type: 'FeatureCollection', features: [] },
      },
      ...overrides,
    })
  }

  it('detects measurable line polygon and mixed GeoJSON assets', () => {
    expect(isMeasurableGeoJsonAsset(geoJsonAsset({ geometryType: 'line' }))).toBe(true)
    expect(isMeasurableGeoJsonAsset(geoJsonAsset({ geometryType: 'polygon' }))).toBe(true)
    expect(isMeasurableGeoJsonAsset(geoJsonAsset({ geometryType: 'mixed' }))).toBe(true)
    expect(isMeasurableGeoJsonAsset(geoJsonAsset({ geometryType: 'point' }))).toBe(false)
    expect(isMeasurableGeoJsonAsset(geoJsonAsset({ metadata: {} }))).toBe(false)
  })
})

describe('scene panel deliverables preview', () => {
  it('groups review summaries by analysis asset and keeps attachment formats', () => {
    const manifest = {
      items: [
        {
          id: 'asset:overlap:geojson',
          label: 'Overlap screen GeoJSON',
          format: 'geojson',
          assetRef: 'asset:overlap',
          filenameHint: 'overlap.geojson',
          reviewSummary: {
            pending: 1,
            confirmed: 2,
            excluded: 3,
            total: 6,
            completed: 5,
            label: '待复核 1 / 已确认 2 / 已排除 3',
          },
        },
        {
          id: 'asset:overlap:csv',
          label: 'Overlap screen CSV',
          format: 'csv',
          assetRef: 'asset:overlap',
          filenameHint: 'overlap.csv',
          reviewSummary: {
            pending: 1,
            confirmed: 2,
            excluded: 3,
            total: 6,
            completed: 5,
            label: '待复核 1 / 已确认 2 / 已排除 3',
          },
        },
        {
          id: 'asset:ordinary:geojson',
          label: 'Ordinary GeoJSON',
          format: 'geojson',
          filenameHint: 'ordinary.geojson',
        },
      ],
    }

    expect(scenePanelDeliverablesReviewPreview(manifest as never)).toEqual([
      {
        id: 'asset:overlap',
        label: 'Overlap screen',
        pending: 1,
        confirmed: 2,
        excluded: 3,
        total: 6,
        completed: 5,
        attachments: [
          { format: 'geojson', filenameHint: 'overlap.geojson' },
          { format: 'csv', filenameHint: 'overlap.csv' },
        ],
      },
    ])
  })

  it('builds business outcome items from analysis assets and review previews', () => {
    const overlap = asset({
      ref: 'asset:overlap',
      id: 'overlap',
      kind: 'asset',
      type: 'analysis-result',
      name: 'Overlap screen',
      geometryType: 'polygon',
      metadata: {
        analysisType: 'polygon_overlap_screen',
        sourceAssetRef: 'asset:parcels',
        targetAssetRef: 'asset:redlines',
        totalCandidates: 2,
        riskLevelCounts: { low: 0, medium: 1, high: 1 },
        renderData: { type: 'FeatureCollection', features: [] },
      },
    })
    const ordinary = asset({
      ref: 'asset:ordinary',
      id: 'ordinary',
      kind: 'asset',
      type: 'vector',
      name: 'Ordinary',
    })

    expect(
      scenePanelBusinessOutcomeItems(
        [ordinary, overlap],
        [
          {
            id: 'asset:overlap',
            label: 'Overlap screen',
            pending: 2,
            confirmed: 1,
            excluded: 1,
            total: 4,
            completed: 2,
            attachments: [
              { format: 'geojson', filenameHint: 'overlap.geojson' },
              { format: 'csv', filenameHint: 'overlap.csv' },
            ],
          },
        ],
      ),
    ).toMatchObject([
      {
        assetRef: 'asset:overlap',
        label: 'Overlap screen',
        analysisType: 'polygon_overlap_screen',
        pendingReviewCount: 2,
        completedReviewCount: 2,
        totalReviewCount: 4,
        deliverableFormats: ['GEOJSON', 'CSV'],
      },
    ])
  })

  it('filters and sorts business outcome items by review status', () => {
    const items = [
      {
        assetRef: 'asset:done',
        label: 'Reviewed outcome',
        analysisType: 'polygon_overlap_screen',
        summaryItems: [],
        deliverableFormats: ['GEOJSON'],
        pendingReviewCount: 0,
        completedReviewCount: 3,
        totalReviewCount: 3,
      },
      {
        assetRef: 'asset:pending',
        label: 'Pending outcome',
        analysisType: 'polygon_overlap_screen',
        summaryItems: [],
        deliverableFormats: ['GEOJSON', 'CSV'],
        pendingReviewCount: 2,
        completedReviewCount: 1,
        totalReviewCount: 3,
      },
      {
        assetRef: 'asset:ordinary-analysis',
        label: 'Ordinary analysis',
        analysisType: 'measure',
        summaryItems: [],
        deliverableFormats: [],
        pendingReviewCount: 0,
        completedReviewCount: 0,
        totalReviewCount: 0,
      },
    ]

    expect(filterScenePanelBusinessOutcomeItems(items).map((item) => item.assetRef)).toEqual([
      'asset:pending',
      'asset:done',
      'asset:ordinary-analysis',
    ])
    expect(
      filterScenePanelBusinessOutcomeItems(items, 'pending-review').map((item) => item.assetRef),
    ).toEqual(['asset:pending'])
    expect(
      filterScenePanelBusinessOutcomeItems(items, 'reviewed').map((item) => item.assetRef),
    ).toEqual(['asset:done'])
  })
})

describe('spatial join display helpers', () => {
  function renderableAsset(overrides: Partial<SpatialAsset> = {}) {
    return asset({
      ref: 'asset:schools',
      id: 'schools',
      kind: 'asset',
      type: 'vector',
      geometryType: 'point',
      metadata: {
        renderTool: 'addGeoJsonLayer',
        renderData: { type: 'FeatureCollection', features: [] },
      },
      ...overrides,
    })
  }

  it('detects renderable polygon assets', () => {
    expect(isRenderablePolygonAsset(renderableAsset({ geometryType: 'polygon' }))).toBe(true)
    expect(isRenderablePolygonAsset(renderableAsset({ geometryType: 'mixed' }))).toBe(true)
    expect(isRenderablePolygonAsset(renderableAsset({ geometryType: 'point' }))).toBe(false)
    expect(isRenderablePolygonAsset(renderableAsset({ metadata: {} }))).toBe(false)
  })

  it('offers polygon targets for selected point assets', () => {
    const points = renderableAsset()
    const polygons = renderableAsset({
      ref: 'asset:districts',
      id: 'districts',
      geometryType: 'polygon',
    })
    const otherPoints = renderableAsset({ ref: 'asset:hospitals', id: 'hospitals' })

    expect(spatialJoinCandidates(points, [points, polygons, otherPoints])).toEqual({
      mode: 'point-to-polygons',
      candidates: [polygons],
    })
  })

  it('offers point targets for selected polygon assets', () => {
    const polygons = renderableAsset({
      ref: 'asset:districts',
      id: 'districts',
      geometryType: 'polygon',
    })
    const points = renderableAsset()
    const otherPolygons = renderableAsset({
      ref: 'asset:grid',
      id: 'grid',
      geometryType: 'polygon',
    })

    expect(spatialJoinCandidates(polygons, [polygons, points, otherPolygons])).toEqual({
      mode: 'polygon-to-points',
      candidates: [points],
    })
  })
})

describe('polygon overlap screen display helpers', () => {
  function renderableAsset(overrides: Partial<SpatialAsset> = {}) {
    return asset({
      ref: 'asset:project-parcels',
      id: 'project-parcels',
      kind: 'asset',
      type: 'vector',
      geometryType: 'polygon',
      metadata: {
        renderTool: 'addGeoJsonLayer',
        renderData: { type: 'FeatureCollection', features: [] },
      },
      ...overrides,
    })
  }

  it('offers other renderable polygon assets as overlap screen targets', () => {
    const source = renderableAsset()
    const redlines = renderableAsset({
      ref: 'asset:redlines',
      id: 'redlines',
      name: 'Ecological redlines',
    })
    const mixedBoundary = renderableAsset({
      ref: 'asset:planning-boundary',
      id: 'planning-boundary',
      geometryType: 'mixed',
    })
    const pointAsset = renderableAsset({
      ref: 'asset:schools',
      id: 'schools',
      geometryType: 'point',
    })

    expect(polygonOverlapCandidates(source, [source, redlines, mixedBoundary, pointAsset])).toEqual(
      [redlines, mixedBoundary],
    )
  })

  it('does not offer overlap targets for non-polygon source assets', () => {
    const source = renderableAsset({ geometryType: 'point' })
    const redlines = renderableAsset({ ref: 'asset:redlines', id: 'redlines' })

    expect(polygonOverlapCandidates(source, [source, redlines])).toEqual([])
  })
})

describe('attribute filter display helpers', () => {
  it('suggests frequent scalar property filters from render data', () => {
    const hospitals = asset({
      ref: 'asset:hospitals',
      id: 'hospitals',
      kind: 'asset',
      type: 'tabular',
      geometryType: 'point',
      metadata: {
        renderData: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { level: '三甲', beds: 800 } },
            { type: 'Feature', properties: { level: '二甲', beds: 300 } },
            { type: 'Feature', properties: { level: '三甲', beds: 500 } },
          ],
        },
      },
    })

    expect(attributeFilterSuggestions(hospitals)[0]).toEqual({
      field: 'level',
      value: '三甲',
      count: 2,
    })
  })

  it('does not suggest filters for non-asset objects', () => {
    expect(
      attributeFilterSuggestions(
        asset({
          ref: 'layer:schools',
          id: 'schools',
          kind: 'layer',
          type: 'geojson',
          metadata: {
            renderData: {
              type: 'Feature',
              properties: { level: '三甲' },
            },
          },
        }),
      ),
    ).toEqual([])
  })
})

describe('analysis summary display helpers', () => {
  it('summarizes polygon overlap screens for selected analysis assets', () => {
    const overlap = asset({
      ref: 'asset:project-parcels-overlap-redlines',
      id: 'project-parcels-overlap-redlines',
      kind: 'asset',
      type: 'analysis-result',
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
      },
    })

    expect(scenePanelAnalysisSummaryItems(overlap)).toEqual([
      '项目地块：asset:project-parcels',
      '管控边界：asset:redlines',
      '疑似冲突地块：1',
      '候选边界命中：1',
      '候选地块面积：1,234,567.89 平方米',
      '风险分布：低 1 / 中 0 / 高 0',
      '筛查方式：vertex_or_edge_intersection',
      '精确叠加：否，需人工复核',
    ])
  })

  it('does not show analysis summaries for regular scene objects', () => {
    expect(
      scenePanelAnalysisSummaryItems(
        asset({
          ref: 'layer:base-map',
          id: 'base-map',
          kind: 'layer',
          type: 'geojson',
        }),
      ),
    ).toEqual([])
  })
})

describe('polygon overlap triage display helpers', () => {
  it('sorts suspected conflict parcels by risk and candidate area', () => {
    const overlap = asset({
      ref: 'asset:project-parcels-overlap-redlines',
      id: 'project-parcels-overlap-redlines',
      kind: 'asset',
      type: 'analysis-result',
      geometryType: 'polygon',
      metadata: {
        analysisType: 'polygon_overlap_screen',
        renderData: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                name: 'Parcel low large',
                overlapCandidateCount: 1,
                candidateAreaSquareMeters: 9000,
                overlapRiskLevel: 'low',
                candidateTargetFeatureIndices: [0],
              },
            },
            {
              type: 'Feature',
              properties: {
                name: 'Parcel high',
                overlapCandidateCount: 3,
                candidateAreaSquareMeters: 1000,
                overlapRiskLevel: 'high',
                candidateTargetFeatureIndices: [0, 1, 2],
              },
            },
            {
              type: 'Feature',
              properties: {
                name: 'Parcel medium larger',
                sourceAssetRef: 'asset:project-parcels',
                sourceFeatureIndex: 7,
                overlapCandidateCount: 2,
                candidateAreaSquareMeters: 5000,
                overlapRiskLevel: 'medium',
                reviewStatus: 'confirmed',
                candidateTargetFeatureIndices: [0, 1],
              },
            },
            {
              type: 'Feature',
              properties: {
                name: 'Parcel medium smaller',
                overlapCandidateCount: 2,
                candidateAreaSquareMeters: 3000,
                overlapRiskLevel: 'medium',
                candidateTargetFeatureIndices: [1, 2],
              },
            },
          ],
        },
      },
    })

    expect(polygonOverlapTriageItems(overlap)).toEqual([
      {
        label: 'Parcel high',
        riskLevel: 'high',
        riskLabel: '高',
        candidateCount: 3,
        areaSquareMeters: 1000,
        sourceFeatureIndex: 1,
        reviewStatus: 'pending',
        reviewStatusLabel: '待复核',
        targetIndices: [0, 1, 2],
      },
      {
        label: 'Parcel medium larger',
        riskLevel: 'medium',
        riskLabel: '中',
        candidateCount: 2,
        areaSquareMeters: 5000,
        sourceAssetRef: 'asset:project-parcels',
        sourceFeatureIndex: 7,
        reviewStatus: 'confirmed',
        reviewStatusLabel: '已确认',
        targetIndices: [0, 1],
      },
      {
        label: 'Parcel medium smaller',
        riskLevel: 'medium',
        riskLabel: '中',
        candidateCount: 2,
        areaSquareMeters: 3000,
        sourceFeatureIndex: 3,
        reviewStatus: 'pending',
        reviewStatusLabel: '待复核',
        targetIndices: [1, 2],
      },
      {
        label: 'Parcel low large',
        riskLevel: 'low',
        riskLabel: '低',
        candidateCount: 1,
        areaSquareMeters: 9000,
        sourceFeatureIndex: 0,
        reviewStatus: 'pending',
        reviewStatusLabel: '待复核',
        targetIndices: [0],
      },
    ])
  })

  it('builds risk overview badges from metadata risk counts', () => {
    const overlap = asset({
      ref: 'asset:project-parcels-overlap-redlines',
      id: 'project-parcels-overlap-redlines',
      kind: 'asset',
      type: 'analysis-result',
      metadata: {
        analysisType: 'polygon_overlap_screen',
        riskLevelCounts: { low: 3, medium: 1, high: 2 },
      },
    })

    expect(polygonOverlapRiskOverview(overlap)).toEqual({
      high: 2,
      medium: 1,
      low: 3,
      total: 6,
      dominantLevel: 'high',
      label: '高 2 / 中 1 / 低 3',
    })
  })

  it('falls back to triage features when risk metadata is absent', () => {
    const overlap = asset({
      ref: 'asset:project-parcels-overlap-redlines',
      id: 'project-parcels-overlap-redlines',
      kind: 'asset',
      type: 'analysis-result',
      metadata: {
        analysisType: 'polygon_overlap_screen',
        renderData: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { overlapCandidateCount: 1, overlapRiskLevel: 'low' } },
            {
              type: 'Feature',
              properties: { overlapCandidateCount: 2, overlapRiskLevel: 'medium' },
            },
          ],
        },
      },
    })

    expect(polygonOverlapRiskOverview(overlap)).toMatchObject({
      high: 0,
      medium: 1,
      low: 1,
      total: 2,
      dominantLevel: 'medium',
      label: '高 0 / 中 1 / 低 1',
    })
  })

  it('does not build a triage list for regular assets', () => {
    expect(
      polygonOverlapTriageItems(
        asset({
          ref: 'asset:schools',
          id: 'schools',
          kind: 'asset',
          type: 'tabular',
          metadata: { renderData: { type: 'FeatureCollection', features: [] } },
        }),
      ),
    ).toEqual([])
  })

  it('filters polygon overlap triage items by risk and keyword', () => {
    const items: PolygonOverlapTriageItem[] = [
      {
        label: 'A01 建设地块',
        riskLevel: 'high',
        riskLabel: '高',
        candidateCount: 3,
        areaSquareMeters: 1200,
        sourceFeatureIndex: 12,
        reviewStatus: 'pending',
        reviewStatusLabel: '待复核',
        targetIndices: [1, 2],
      },
      {
        label: 'B02 生态缓冲',
        riskLevel: 'medium',
        riskLabel: '中',
        candidateCount: 1,
        areaSquareMeters: 300,
        sourceAssetRef: 'asset:buffer',
        sourceFeatureIndex: 8,
        reviewStatus: 'confirmed',
        reviewStatusLabel: '已确认',
        targetIndices: [8],
      },
      {
        label: 'C03 低影响',
        riskLevel: 'low',
        riskLabel: '低',
        candidateCount: 1,
        sourceFeatureIndex: 30,
        reviewStatus: 'excluded',
        reviewStatusLabel: '已排除',
        targetIndices: [9],
      },
    ]

    expect(filterPolygonOverlapTriageItems(items, { riskLevel: 'medium', query: '生态' })).toEqual([
      items[1],
    ])
    expect(filterPolygonOverlapTriageItems(items, { riskLevel: 'all', query: '2' })).toEqual([
      items[0],
      items[1],
    ])
    expect(filterPolygonOverlapTriageItems(items, { riskLevel: 'high', query: '生态' })).toEqual([])
    expect(
      filterPolygonOverlapTriageItems(items, { riskLevel: 'all', query: 'asset:buffer' }),
    ).toEqual([items[1]])
    expect(polygonOverlapReviewOverview(items)).toMatchObject({
      pending: 1,
      confirmed: 1,
      excluded: 1,
      total: 3,
    })
    expect(polygonOverlapReviewUpdateTargets(items, 'confirmed')).toEqual([items[0], items[2]])
    expect(polygonOverlapReviewUpdateTargets(items, 'excluded')).toEqual([items[0], items[1]])
    expect(
      polygonOverlapReviewUpdateTargets(
        [
          ...items,
          {
            label: 'D04 no source index',
            riskLevel: 'high',
            riskLabel: '高',
            candidateCount: 1,
            reviewStatus: 'pending',
            reviewStatusLabel: '待复核',
            targetIndices: [],
          },
        ],
        'confirmed',
      ),
    ).toEqual([items[0], items[2]])
    expect(filterPolygonOverlapTriageItems(items, { reviewStatus: 'confirmed' })).toEqual([
      items[1],
    ])
    expect(
      filterPolygonOverlapTriageItems(items, { riskLevel: 'low', reviewStatus: 'excluded' }),
    ).toEqual([items[2]])
    expect(filterPolygonOverlapTriageItems(items, { riskLevel: 'all', query: '已排除' })).toEqual([
      items[2],
    ])
  })
})
