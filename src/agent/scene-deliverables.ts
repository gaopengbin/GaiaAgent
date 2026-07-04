import type { SceneState, SpatialAsset } from './types'
import { geoJsonToCsv } from './geojson-csv'
import {
  analysisDescription,
  analysisReviewSummary,
  type AnalysisReviewSummary,
} from './scene-analysis-summary'

export type SceneDeliverableFormat = 'scene-json' | 'markdown' | 'geojson' | 'csv'

export interface SceneDeliverableItem {
  id: string
  label: string
  format: SceneDeliverableFormat
  source: 'scene' | 'report' | 'asset' | 'analysis'
  assetRef?: string
  assetId?: string
  assetType?: string
  geometryType?: string
  featureCount?: number
  filenameHint: string
  description: string
  reviewSummary?: AnalysisReviewSummary
}

export interface SceneDeliverablesManifest {
  kind: 'gaia-agent-deliverables'
  version: 1
  sessionId: string
  exportedAt: string
  sceneRevision: number
  counts: {
    objects: number
    visibleObjects: number
    dataAssets: number
    analysisResults: number
    geojson: number
    csv: number
    totalDeliverables: number
  }
  items: SceneDeliverableItem[]
}

function assetDisplayName(asset: SpatialAsset) {
  return asset.name || asset.id || asset.ref
}

function safeFilenameStem(value: string) {
  const withoutControlChars = Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character
    })
    .join('')
  return (
    withoutControlChars
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'scene'
  )
}

function isAnalysisAsset(asset: SpatialAsset) {
  return (
    asset.kind === 'asset' && (asset.type === 'analysis-result' || !!asset.metadata?.analysisType)
  )
}

function hasRenderableGeoJson(asset: SpatialAsset) {
  const renderData = asset.metadata?.renderData
  return asset.kind === 'asset' && !!renderData && typeof renderData === 'object'
}

function canExportCsv(asset: SpatialAsset) {
  return asset.kind === 'asset' && !!geoJsonToCsv(asset.metadata?.renderData)
}

function sortedSceneAssets(scene: SceneState) {
  return Object.values(scene.assets).sort((left, right) =>
    (left.kind + left.type + assetDisplayName(left)).localeCompare(
      right.kind + right.type + assetDisplayName(right),
      'zh-CN',
    ),
  )
}

function assetDeliverableBase(asset: SpatialAsset) {
  return {
    assetRef: asset.ref,
    assetId: asset.id,
    assetType: asset.type,
    geometryType: asset.geometryType,
    featureCount: asset.featureCount,
  }
}

export function buildSceneDeliverablesManifest(
  sessionId: string,
  scene: SceneState,
  exportedAt: string,
): SceneDeliverablesManifest {
  const assets = sortedSceneAssets(scene)
  const dataAssets = assets.filter((asset) => asset.kind === 'asset')
  const analysisAssets = dataAssets.filter(isAnalysisAsset)
  const renderableAssets = dataAssets.filter(hasRenderableGeoJson)
  const csvAssets = dataAssets.filter(canExportCsv)
  const items: SceneDeliverableItem[] = [
    {
      id: 'scene-json',
      label: '场景 JSON',
      format: 'scene-json',
      source: 'scene',
      filenameHint: 'gaia-scene.json',
      description: '完整结构化 SceneState，可用于导入复现当前场景对象和资产索引。',
    },
    {
      id: 'markdown-report',
      label: '分析报告',
      format: 'markdown',
      source: 'report',
      filenameHint: 'gaia-scene-report.md',
      description: '面向交付阅读的 Markdown 摘要，包含场景统计、资产表、分析结果和可导出成果。',
    },
  ]

  for (const asset of renderableAssets) {
    const label = assetDisplayName(asset)
    const reviewSummary = analysisReviewSummary(asset)
    items.push({
      id: `${asset.ref}:geojson`,
      label: `${label} GeoJSON`,
      format: 'geojson',
      source: isAnalysisAsset(asset) ? 'analysis' : 'asset',
      filenameHint: `${safeFilenameStem(label)}.geojson`,
      description: isAnalysisAsset(asset)
        ? analysisDescription(asset)
        : '数据资产的可渲染 GeoJSON，可用于外部 GIS 软件或再次导入。',
      ...(reviewSummary ? { reviewSummary } : {}),
      ...assetDeliverableBase(asset),
    })
  }

  for (const asset of csvAssets) {
    const label = assetDisplayName(asset)
    const reviewSummary = analysisReviewSummary(asset)
    items.push({
      id: `${asset.ref}:csv`,
      label: `${label} CSV`,
      format: 'csv',
      source: isAnalysisAsset(asset) ? 'analysis' : 'asset',
      filenameHint: `${safeFilenameStem(label)}.csv`,
      description:
        asset.geometryType === 'point'
          ? '点位资产的表格交付物，包含原始属性字段和 lon/lat 坐标列。'
          : 'GeoJSON 属性表交付物，包含要素属性字段，可用于业务复核清单。',
      ...(reviewSummary ? { reviewSummary } : {}),
      ...assetDeliverableBase(asset),
    })
  }

  return {
    kind: 'gaia-agent-deliverables',
    version: 1,
    sessionId,
    exportedAt,
    sceneRevision: scene.revision,
    counts: {
      objects: assets.length,
      visibleObjects: assets.filter((asset) => asset.visible !== false).length,
      dataAssets: dataAssets.length,
      analysisResults: analysisAssets.length,
      geojson: renderableAssets.length,
      csv: csvAssets.length,
      totalDeliverables: items.length,
    },
    items,
  }
}
