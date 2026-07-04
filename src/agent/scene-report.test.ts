import { describe, expect, it } from 'vitest'
import type { SceneState } from './types'
import { buildSceneMarkdownReport } from './scene-report'

describe('scene report', () => {
  it('builds a markdown report with scene counts, assets, analysis results, and deliverables', () => {
    const scene = {
      revision: 9,
      camera: { lon: 116.397, lat: 39.916, height: 1200 },
      layers: [{ id: 'schools-buffer-500m', type: 'geojson', source: 'analysis' }],
      labels: [],
      activeObjectRef: 'asset:schools-buffer-500m',
      recentObjectRefs: ['asset:schools-buffer-500m'],
      assets: {
        'asset:schools': {
          ref: 'asset:schools',
          id: 'schools',
          kind: 'asset',
          type: 'tabular',
          name: 'Schools | CSV',
          source: 'import',
          geometryType: 'point',
          featureCount: 2,
          bbox: [116.1, 39.7, 116.2, 39.8],
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
        'asset:schools-buffer-500m': {
          ref: 'asset:schools-buffer-500m',
          id: 'schools-buffer-500m',
          kind: 'asset',
          type: 'analysis-result',
          name: 'Schools 500m buffer',
          source: 'agent',
          geometryType: 'polygon',
          featureCount: 2,
          bbox: [116.09, 39.69, 116.21, 39.81],
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
        'asset:districts-count-schools': {
          ref: 'asset:districts-count-schools',
          id: 'districts-count-schools',
          kind: 'asset',
          type: 'analysis-result',
          name: 'District school counts',
          source: 'agent',
          geometryType: 'polygon',
          featureCount: 3,
          bbox: [116.0, 39.0, 116.3, 39.9],
          metadata: {
            analysisType: 'spatial_join',
            polygonAssetRef: 'asset:districts',
            pointAssetRef: 'asset:schools',
            totalMatches: 18,
            renderData: {
              type: 'FeatureCollection',
              features: [],
            },
          },
        },
        'asset:hospitals-filter-level': {
          ref: 'asset:hospitals-filter-level',
          id: 'hospitals-filter-level',
          kind: 'asset',
          type: 'analysis-result',
          name: 'Hospitals level filter',
          source: 'agent',
          geometryType: 'point',
          featureCount: 2,
          bbox: [116.1, 39.8, 116.3, 40.0],
          metadata: {
            analysisType: 'filter',
            sourceAssetRef: 'asset:hospitals',
            field: 'level',
            operator: 'eq',
            value: '三甲',
            matchedCount: 2,
            sourceFeatureCount: 3,
            renderData: {
              type: 'FeatureCollection',
              features: [],
            },
          },
        },
        'asset:district-measure': {
          ref: 'asset:district-measure',
          id: 'district-measure',
          kind: 'asset',
          type: 'analysis-result',
          name: 'District measure',
          source: 'agent',
          geometryType: 'polygon',
          featureCount: 1,
          bbox: [116.0, 39.0, 116.1, 39.1],
          metadata: {
            analysisType: 'measure',
            sourceAssetRef: 'asset:district',
            totalAreaSquareMeters: 1234567.89,
            totalPerimeterMeters: 4567.89,
            renderData: {
              type: 'FeatureCollection',
              features: [],
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
          bbox: [116.0, 39.0, 116.05, 39.05],
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

    const report = buildSceneMarkdownReport('session-1', scene, '2026-07-03T12:00:00.000Z')

    expect(report).toContain('# GaiaAgent 场景分析报告')
    expect(report).toContain('- 对象数量：6')
    expect(report).toContain('- 数据资产：6')
    expect(report).toContain('- 分析结果：5')
    expect(report).toContain('- 相机：lon 116.397000, lat 39.916000, height 1200.0m')
    expect(report).toContain('polygon_overlap_screen')
    expect(report).toContain('  - 项目地块：asset:project-parcels')
    expect(report).toContain('  - 管控边界：asset:redlines')
    expect(report).toContain('  - 疑似冲突地块：1')
    expect(report).toContain('  - 候选边界命中：1')
    expect(report).toContain('  - 候选地块面积：1,234,567.89 平方米')
    expect(report).toContain('  - 风险分布：低 1 / 中 0 / 高 0')
    expect(report).toContain('  - 复核状态：待复核 1 / 已确认 1 / 已排除 1')
    expect(report).toContain('  - 复核进度：2 / 3')
    expect(report).toContain('  - 筛查方式：vertex_or_edge_intersection')
    expect(report).toContain('  - 精确叠加：否，需人工复核')
    expect(report).toContain('Schools \\| CSV')
    expect(report).toContain('116.090000, 39.690000, 116.210000, 39.810000')
    expect(report).toContain(
      '- Schools 500m buffer (asset:schools-buffer-500m)：buffer，来源 asset:schools，要素 2',
    )
    expect(report).toContain('  - 缓冲半径：500 米')
    expect(report).toContain('  - 面内点总数：18')
    expect(report).toContain('  - 过滤条件：level eq 三甲')
    expect(report).toContain('  - 命中要素：2 / 3')
    expect(report).toContain('  - 总面积：1,234,567.89 平方米')
    expect(report).toContain('  - 总周长：4,567.89 米')
    expect(report).toContain('可在资产卡片中导出 GeoJSON')
    expect(report).toContain('Schools | CSV：可在资产卡片中导出 CSV（asset:schools）')
    expect(report).toContain('Schools 500m buffer：可在资产卡片中导出 CSV')
  })

  it('states when there are no analysis results or deliverables', () => {
    const scene = {
      revision: 1,
      camera: null,
      layers: [],
      labels: [],
      activeObjectRef: null,
      recentObjectRefs: [],
      assets: {},
    } satisfies SceneState

    const report = buildSceneMarkdownReport('empty', scene, '2026-07-03T12:00:00.000Z')

    expect(report).toContain('- 对象数量：0')
    expect(report).toContain('- 相机：未记录')
    expect(report).toContain('- 暂无分析结果资产。')
    expect(report).toContain('- 暂无可直接导出的 GeoJSON 资产。')
  })
})
