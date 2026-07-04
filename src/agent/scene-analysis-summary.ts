import type { SpatialAsset } from './types'

export function analysisNumberText(value: unknown, fractionDigits = 2) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('zh-CN', { maximumFractionDigits: fractionDigits })
    : undefined
}

export function metadataText(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  return String(value)
}

function metadataRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function metadataArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function assetFeatureCountText(asset: SpatialAsset) {
  return asset.featureCount === undefined ? undefined : asset.featureCount.toLocaleString('zh-CN')
}

export interface AnalysisReviewSummary {
  pending: number
  confirmed: number
  excluded: number
  total: number
  completed: number
  label: string
}

function normalizedReviewStatus(value: unknown) {
  if (value === 'confirmed' || value === '已确认') return 'confirmed'
  if (value === 'excluded' || value === '已排除') return 'excluded'
  return 'pending'
}

export function analysisReviewSummary(asset: SpatialAsset): AnalysisReviewSummary | undefined {
  if (asset.kind !== 'asset' || asset.metadata?.analysisType !== 'polygon_overlap_screen') {
    return undefined
  }
  const renderData = metadataRecord(asset.metadata.renderData)
  const features = metadataArray(renderData?.features)
  if (features.length === 0) return undefined

  let pending = 0
  let confirmed = 0
  let excluded = 0
  for (const feature of features) {
    const properties = metadataRecord(metadataRecord(feature)?.properties)
    const status = normalizedReviewStatus(properties?.reviewStatus)
    if (status === 'confirmed') {
      confirmed += 1
    } else if (status === 'excluded') {
      excluded += 1
    } else {
      pending += 1
    }
  }

  const total = pending + confirmed + excluded
  const completed = confirmed + excluded
  return {
    pending,
    confirmed,
    excluded,
    total,
    completed,
    label: `待复核 ${pending} / 已确认 ${confirmed} / 已排除 ${excluded}`,
  }
}

export function analysisSourceText(asset: SpatialAsset) {
  return (
    metadataText(asset.metadata?.sourceAssetRef) ??
    metadataText(asset.metadata?.pointAssetRef) ??
    metadataText(asset.metadata?.polygonAssetRef) ??
    metadataText(asset.metadata?.targetAssetRef) ??
    '-'
  )
}

export function analysisBusinessSummary(asset: SpatialAsset) {
  const metadata = asset.metadata ?? {}
  switch (metadata.analysisType) {
    case 'buffer': {
      const distance = analysisNumberText(metadata.distanceMeters, 0)
      const segments = analysisNumberText(metadata.segments, 0)
      return [
        distance ? `缓冲半径：${distance} 米` : undefined,
        segments ? `圆弧分段：${segments}` : undefined,
      ].filter(Boolean) as string[]
    }
    case 'nearest': {
      const maxDistance = analysisNumberText(metadata.maxDistanceMeters, 0)
      return [
        `源资产：${metadataText(metadata.sourceAssetRef) ?? '-'}`,
        `目标资产：${metadataText(metadata.targetAssetRef) ?? '-'}`,
        `匹配连线：${assetFeatureCountText(asset) ?? '-'} 条`,
        maxDistance ? `最大匹配距离：${maxDistance} 米` : undefined,
      ].filter(Boolean) as string[]
    }
    case 'measure': {
      const totalLength = analysisNumberText(metadata.totalLengthMeters)
      const totalArea = analysisNumberText(metadata.totalAreaSquareMeters)
      const totalPerimeter = analysisNumberText(metadata.totalPerimeterMeters)
      return [
        totalLength ? `总长度：${totalLength} 米` : undefined,
        totalArea ? `总面积：${totalArea} 平方米` : undefined,
        totalPerimeter ? `总周长：${totalPerimeter} 米` : undefined,
      ].filter(Boolean) as string[]
    }
    case 'spatial_join': {
      const totalMatches = analysisNumberText(metadata.totalMatches, 0)
      return [
        `统计面：${metadataText(metadata.polygonAssetRef) ?? '-'}`,
        `统计点：${metadataText(metadata.pointAssetRef) ?? '-'}`,
        totalMatches ? `面内点总数：${totalMatches}` : undefined,
      ].filter(Boolean) as string[]
    }
    case 'polygon_overlap_screen': {
      const totalCandidates = analysisNumberText(metadata.totalCandidates, 0)
      const totalCandidateArea = analysisNumberText(metadata.totalCandidateAreaSquareMeters)
      const featureCount = assetFeatureCountText(asset)
      const riskCounts = metadataRecord(metadata.riskLevelCounts)
      const lowRisk = analysisNumberText(riskCounts?.low, 0)
      const mediumRisk = analysisNumberText(riskCounts?.medium, 0)
      const highRisk = analysisNumberText(riskCounts?.high, 0)
      const riskSummary =
        lowRisk || mediumRisk || highRisk
          ? `风险分布：低 ${lowRisk ?? '0'} / 中 ${mediumRisk ?? '0'} / 高 ${highRisk ?? '0'}`
          : undefined
      const reviewSummary = analysisReviewSummary(asset)
      const reviewProgress =
        reviewSummary && reviewSummary.total > 0
          ? `复核进度：${reviewSummary.completed} / ${reviewSummary.total}`
          : undefined
      const exactOverlay =
        metadata.exactOverlay === false ? '否，需人工复核' : metadataText(metadata.exactOverlay)
      return [
        `项目地块：${metadataText(metadata.sourceAssetRef) ?? '-'}`,
        `管控边界：${metadataText(metadata.targetAssetRef) ?? '-'}`,
        featureCount ? `疑似冲突地块：${featureCount}` : undefined,
        totalCandidates ? `候选边界命中：${totalCandidates}` : undefined,
        totalCandidateArea ? `候选地块面积：${totalCandidateArea} 平方米` : undefined,
        riskSummary,
        reviewSummary ? `复核状态：${reviewSummary.label}` : undefined,
        reviewProgress,
        metadataText(metadata.screenType)
          ? `筛查方式：${metadataText(metadata.screenType)}`
          : undefined,
        exactOverlay ? `精确叠加：${exactOverlay}` : undefined,
      ].filter(Boolean) as string[]
    }
    case 'filter': {
      const matched = analysisNumberText(metadata.matchedCount, 0)
      const source = analysisNumberText(metadata.sourceFeatureCount, 0)
      const field = metadataText(metadata.field)
      const operator = metadataText(metadata.operator)
      const value = metadataText(metadata.value)
      return [
        field && operator ? `过滤条件：${field} ${operator}${value ? ` ${value}` : ''}` : undefined,
        matched && source ? `命中要素：${matched} / ${source}` : undefined,
      ].filter(Boolean) as string[]
    }
    default:
      return []
  }
}

export function analysisDescription(asset: SpatialAsset) {
  const details = analysisBusinessSummary(asset)
  return details.length > 0
    ? `分析结果的可渲染 GeoJSON，可作为下游 GIS 数据继续处理。${details.join('；')}。`
    : '分析结果的可渲染 GeoJSON，可作为下游 GIS 数据继续处理。'
}
