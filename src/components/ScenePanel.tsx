import { useMemo, useState } from 'react'
import {
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  Layers,
  Lock,
  MapPin,
  PackageCheck,
  Pencil,
  RefreshCcw,
  Ruler,
  Search,
  Trash2,
  Unlock,
  Upload,
  Waypoints,
} from 'lucide-react'
import type { SceneState, SpatialAsset } from '../agent'
import {
  buildSceneDeliverablesManifest,
  type SceneDeliverablesManifest,
  type SceneDeliverableFormat,
} from '../agent/scene-deliverables'
import { analysisBusinessSummary } from '../agent/scene-analysis-summary'
import { cn } from '../lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import type { SceneObjectTaskLink } from '../agent/scene-links'

interface ScenePanelProps {
  scene: SceneState
  busy?: boolean
  onRefresh: () => Promise<void> | void
  onSelect: (asset: SpatialAsset) => Promise<void> | void
  onFocus: (asset: SpatialAsset) => Promise<void> | void
  onHighlightFeature?: (
    asset: SpatialAsset,
    featureIndex?: number,
    options?: { clear?: boolean; color?: string },
  ) => Promise<void> | void
  onSetFeatureReviewStatus?: (
    asset: SpatialAsset,
    featureIndex: number,
    reviewStatus: PolygonOverlapReviewStatus,
  ) => Promise<void> | void
  onRename: (asset: SpatialAsset) => Promise<void> | void
  onVisibilityChange: (asset: SpatialAsset, visible: boolean) => Promise<void> | void
  onLockChange: (asset: SpatialAsset, locked: boolean) => Promise<void> | void
  onDelete: (asset: SpatialAsset) => Promise<void> | void
  onAddAssetToMap: (asset: SpatialAsset) => Promise<void> | void
  onCreateBuffer: (asset: SpatialAsset, distanceMeters?: number) => Promise<void> | void
  onCreateNearest: (source: SpatialAsset, target: SpatialAsset) => Promise<void> | void
  onCreateSpatialJoin: (
    pointAsset: SpatialAsset,
    polygonAsset: SpatialAsset,
  ) => Promise<void> | void
  onCreatePolygonOverlapScreen: (
    sourceAsset: SpatialAsset,
    targetAsset: SpatialAsset,
  ) => Promise<void> | void
  onMeasureAsset: (asset: SpatialAsset) => Promise<void> | void
  onCreateAttributeFilter: (
    asset: SpatialAsset,
    field: string,
    value: string | number | boolean,
  ) => Promise<void> | void
  onExportAssetGeoJson: (asset: SpatialAsset) => Promise<void> | void
  onExportAssetCsv: (asset: SpatialAsset) => Promise<void> | void
  onSetAllVisibility: (visible: boolean) => Promise<void> | void
  onClearAgentObjects: () => Promise<void> | void
  onClearScene: () => Promise<void> | void
  onExportScene: () => Promise<void> | void
  onExportMarkdownReport: () => Promise<void> | void
  onExportDeliverablesManifest: () => Promise<void> | void
  onExportDeliverablesPackage: () => Promise<void> | void
  onImportDeliverablesPackage: () => Promise<void> | void
  onImportScene: () => Promise<void> | void
  onImportGeoJson: () => Promise<void> | void
  onImportCsv: () => Promise<void> | void
  taskLinks?: Record<string, SceneObjectTaskLink>
  onOpenTaskStep?: (link: SceneObjectTaskLink) => Promise<void> | void
}

function assetKindLabel(asset: SpatialAsset) {
  if (asset.kind === 'asset') return '数据资产'
  if (asset.kind === 'layer') return '图层'
  switch (asset.type) {
    case 'marker':
    case 'point':
    case 'billboard':
      return '标注'
    case 'polyline':
    case 'flight':
      return '路线'
    case 'polygon':
    case 'rectangle':
    case 'ellipse':
      return '区域'
    case 'model':
    case 'box':
    case 'cylinder':
    case 'wall':
    case 'corridor':
      return '三维对象'
    default:
      return asset.type || '对象'
  }
}

function assetGroupLabel(asset: SpatialAsset) {
  if (asset.kind === 'asset') return '数据资产'
  if (asset.kind === 'layer') return '图层'
  const label = assetKindLabel(asset)
  return label === '对象' ? '实体对象' : label
}

function assetIcon(asset: SpatialAsset) {
  if (asset.kind === 'asset') return <Info className="size-3.5" aria-hidden="true" />
  if (asset.kind === 'layer') return <Layers className="size-3.5" aria-hidden="true" />
  if (asset.type === 'polyline' || asset.type === 'flight') {
    return <Waypoints className="size-3.5" aria-hidden="true" />
  }
  return <MapPin className="size-3.5" aria-hidden="true" />
}

function assetSubtitle(asset: SpatialAsset) {
  if (asset.position) {
    return `${asset.position.lon.toFixed(5)}, ${asset.position.lat.toFixed(5)}`
  }
  if (asset.uri) return asset.uri
  if (asset.dataRefId) return asset.dataRefId
  return asset.id
}

function sourceLabel(asset: SpatialAsset) {
  if (asset.source === 'user') return '面板/用户'
  if (asset.source === 'agent') return 'AI / 工具'
  if (asset.source === 'mcp') return 'MCP 工具'
  if (asset.source === 'import') return '导入'
  if (asset.source === 'snapshot') return '场景快照'
  if (asset.lastCallId?.startsWith('scene-panel:')) return '面板操作'
  if (asset.lastCallId) return 'AI / 工具'
  return '场景快照'
}

function assetRiskSortPriority(asset: SpatialAsset) {
  const overview = polygonOverlapRiskOverview(asset)
  if (!overview) return 10
  if (overview.dominantLevel === 'high') return 0
  if (overview.dominantLevel === 'medium') return 1
  return 2
}

export function sortAssets(assets: SpatialAsset[]) {
  return [...assets].sort((a, b) => {
    const groupCompare = assetGroupLabel(a).localeCompare(assetGroupLabel(b), 'zh-CN')
    if (groupCompare !== 0) return groupCompare
    const riskCompare = assetRiskSortPriority(a) - assetRiskSortPriority(b)
    if (riskCompare !== 0) return riskCompare
    return (a.name ?? a.id).localeCompare(b.name ?? b.id, 'zh-CN')
  })
}

function matchesAsset(asset: SpatialAsset, query: string) {
  const text = [
    asset.ref,
    asset.id,
    asset.kind,
    asset.type,
    asset.name,
    asset.dataRefId,
    asset.lastCallId,
    assetKindLabel(asset),
    sourceLabel(asset),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return text.includes(query.trim().toLowerCase())
}

export interface ScenePanelAssetDisplayModel {
  assets: SpatialAsset[]
  foldedAssets: SpatialAsset[]
  foldedByParentRef: Record<string, SpatialAsset[]>
}

function normalizedAssetName(asset: SpatialAsset) {
  return (asset.name || asset.id).trim().toLowerCase()
}

function isMarkerLikeEntity(asset: SpatialAsset) {
  return (
    asset.kind === 'entity' &&
    ['marker', 'point', 'billboard'].includes(asset.type.trim().toLowerCase())
  )
}

function isMarkerImplementationLayer(asset: SpatialAsset) {
  const type = asset.type.trim().toLowerCase()
  return (
    asset.kind === 'layer' &&
    (type === 'marker' ||
      asset.id.startsWith('marker_') ||
      asset.ref.startsWith('layer:marker_') ||
      asset.dataRefId?.startsWith('marker_'))
  )
}

function markerLayerBelongsToEntity(layer: SpatialAsset, entity: SpatialAsset) {
  if (!isMarkerLikeEntity(entity)) return false

  const sameCall =
    layer.lastCallId !== undefined &&
    entity.lastCallId !== undefined &&
    layer.lastCallId === entity.lastCallId
  const sameName = normalizedAssetName(layer) === normalizedAssetName(entity)
  const sameDataRef =
    layer.dataRefId !== undefined &&
    entity.dataRefId !== undefined &&
    layer.dataRefId === entity.dataRefId

  return sameDataRef || (sameCall && sameName) || (sameCall && layer.id.startsWith('marker_'))
}

export function buildScenePanelAssetDisplayModel(
  assets: SpatialAsset[],
): ScenePanelAssetDisplayModel {
  const entities = assets.filter(isMarkerLikeEntity)
  const foldedRefs = new Set<string>()
  const foldedByParentRef: Record<string, SpatialAsset[]> = {}

  for (const asset of assets) {
    if (!isMarkerImplementationLayer(asset)) continue
    const pairedEntity = entities.find((entity) => markerLayerBelongsToEntity(asset, entity))
    if (pairedEntity) {
      foldedRefs.add(asset.ref)
      foldedByParentRef[pairedEntity.ref] = foldedByParentRef[pairedEntity.ref] ?? []
      foldedByParentRef[pairedEntity.ref].push(asset)
    }
  }

  return {
    assets: assets.filter((asset) => !foldedRefs.has(asset.ref)),
    foldedAssets: assets.filter((asset) => foldedRefs.has(asset.ref)),
    foldedByParentRef,
  }
}

function assetPositionLabel(asset: SpatialAsset) {
  if (!asset.position) return undefined
  return `${asset.position.lon.toFixed(6)}, ${asset.position.lat.toFixed(6)}, ${asset.position.height.toFixed(1)}m`
}

function assetStatusLabel(asset: SpatialAsset) {
  const status = [asset.visible === false ? '隐藏' : '可见']
  if (asset.locked) status.push('已锁定')
  return status.join(' / ')
}

function assetBboxLabel(asset: SpatialAsset) {
  if (!asset.bbox) return undefined
  return asset.bbox.map((value) => value.toFixed(6)).join(', ')
}

function assetSchemaLabel(asset: SpatialAsset) {
  if (!asset.schema) return undefined
  const fields = Object.entries(asset.schema)
    .map(([name, descriptor]) => {
      const type =
        descriptor && typeof descriptor === 'object' && 'type' in descriptor
          ? String((descriptor as { type?: unknown }).type ?? 'unknown')
          : typeof descriptor === 'string'
            ? descriptor
            : 'unknown'
      return `${name}:${type}`
    })
    .slice(0, 12)
  if (fields.length === 0) return undefined
  const suffix = Object.keys(asset.schema).length > fields.length ? ' …' : ''
  return `${fields.join(', ')}${suffix}`
}

function assetRenderLabel(asset: SpatialAsset) {
  const renderTool = asset.metadata?.renderTool
  const layerRef = asset.metadata?.layerRef
  if (typeof renderTool !== 'string') return undefined
  return typeof layerRef === 'string' ? `${renderTool} → ${layerRef}` : renderTool
}

function canCreatePointBuffer(asset: SpatialAsset) {
  return isRenderablePointAsset(asset)
}

export function isRenderablePointAsset(asset: SpatialAsset) {
  return (
    asset.kind === 'asset' &&
    asset.metadata?.renderTool === 'addGeoJsonLayer' &&
    !!asset.metadata?.renderData &&
    ['point', 'mixed', undefined].includes(asset.geometryType)
  )
}

export function isMeasurableGeoJsonAsset(asset: SpatialAsset) {
  return (
    asset.kind === 'asset' &&
    asset.metadata?.renderTool === 'addGeoJsonLayer' &&
    !!asset.metadata?.renderData &&
    ['line', 'polygon', 'mixed', undefined].includes(asset.geometryType)
  )
}

export function isRenderablePolygonAsset(asset: SpatialAsset) {
  return (
    asset.kind === 'asset' &&
    asset.metadata?.renderTool === 'addGeoJsonLayer' &&
    !!asset.metadata?.renderData &&
    ['polygon', 'mixed', undefined].includes(asset.geometryType)
  )
}

export function nearestTargetCandidates(source: SpatialAsset, assets: SpatialAsset[]) {
  if (!isRenderablePointAsset(source)) return []
  return assets.filter((asset) => asset.ref !== source.ref && isRenderablePointAsset(asset))
}

export function spatialJoinCandidates(source: SpatialAsset, assets: SpatialAsset[]) {
  if (isRenderablePointAsset(source)) {
    return {
      mode: 'point-to-polygons' as const,
      candidates: assets.filter(
        (asset) => asset.ref !== source.ref && isRenderablePolygonAsset(asset),
      ),
    }
  }
  if (isRenderablePolygonAsset(source)) {
    return {
      mode: 'polygon-to-points' as const,
      candidates: assets.filter(
        (asset) => asset.ref !== source.ref && isRenderablePointAsset(asset),
      ),
    }
  }
  return {
    mode: 'none' as const,
    candidates: [],
  }
}

export function polygonOverlapCandidates(source: SpatialAsset, assets: SpatialAsset[]) {
  if (!isRenderablePolygonAsset(source)) return []
  return assets.filter((asset) => asset.ref !== source.ref && isRenderablePolygonAsset(asset))
}

export interface AttributeFilterSuggestion {
  field: string
  value: string | number | boolean
  count: number
}

export interface PolygonOverlapTriageItem {
  label: string
  riskLevel: string
  riskLabel: string
  candidateCount: number
  areaSquareMeters?: number
  sourceAssetRef?: string
  sourceFeatureIndex?: number
  reviewStatus: PolygonOverlapReviewStatus
  reviewStatusLabel: string
  targetIndices: number[]
}

export type PolygonOverlapRiskFilter = 'all' | 'high' | 'medium' | 'low'
export type PolygonOverlapReviewStatus = 'pending' | 'confirmed' | 'excluded'
export type PolygonOverlapReviewFilter = 'all' | PolygonOverlapReviewStatus

export interface PolygonOverlapTriageFilter {
  query?: string
  riskLevel?: PolygonOverlapRiskFilter
  reviewStatus?: PolygonOverlapReviewFilter
}

export interface PolygonOverlapRiskOverview {
  high: number
  medium: number
  low: number
  total: number
  label: string
  dominantLevel: 'high' | 'medium' | 'low'
}

export interface PolygonOverlapReviewOverview {
  pending: number
  confirmed: number
  excluded: number
  total: number
  label: string
}

export interface ScenePanelDeliverablesReviewPreview {
  id: string
  label: string
  pending: number
  confirmed: number
  excluded: number
  total: number
  completed: number
  attachments: Array<{
    format: SceneDeliverableFormat
    filenameHint: string
  }>
}

export interface ScenePanelBusinessOutcomeItem {
  assetRef: string
  label: string
  analysisType: string
  summaryItems: string[]
  deliverableFormats: string[]
  pendingReviewCount: number
  completedReviewCount: number
  totalReviewCount: number
}

export type ScenePanelBusinessOutcomeFilter = 'all' | 'pending-review' | 'reviewed' | 'analysis'

interface HighlightedTriageFeature {
  assetRef: string
  featureIndex?: number
  label: string
}

function isScalarFilterValue(value: unknown): value is string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof value)
}

function metadataRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function riskRank(level: string) {
  if (level === 'high') return 3
  if (level === 'medium') return 2
  if (level === 'low') return 1
  return 0
}

function riskLabel(level: string) {
  if (level === 'high') return '高'
  if (level === 'medium') return '中'
  if (level === 'low') return '低'
  return level || '-'
}

function reviewStatusLabel(status: PolygonOverlapReviewStatus) {
  if (status === 'confirmed') return '已确认'
  if (status === 'excluded') return '已排除'
  return '待复核'
}

function normalizedReviewStatus(value: unknown): PolygonOverlapReviewStatus {
  if (value === 'confirmed' || value === '已确认') return 'confirmed'
  if (value === 'excluded' || value === '已排除') return 'excluded'
  return 'pending'
}

function candidateTargetIndices(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : []
}

function integerValue(value: unknown) {
  const number = numberValue(value)
  return number === undefined ? undefined : Math.max(0, Math.trunc(number))
}

export function attributeFilterSuggestions(asset: SpatialAsset): AttributeFilterSuggestion[] {
  const renderData = asset.metadata?.renderData
  if (asset.kind !== 'asset' || !renderData || typeof renderData !== 'object') return []
  const features =
    'type' in renderData &&
    renderData.type === 'FeatureCollection' &&
    'features' in renderData &&
    Array.isArray(renderData.features)
      ? renderData.features
      : 'type' in renderData && renderData.type === 'Feature'
        ? [renderData]
        : []

  const counts = new Map<string, AttributeFilterSuggestion>()
  for (const feature of features.slice(0, 500)) {
    if (!feature || typeof feature !== 'object' || !('properties' in feature)) continue
    const properties = feature.properties
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) continue
    for (const [field, value] of Object.entries(properties)) {
      if (!field || !isScalarFilterValue(value)) continue
      const key = `${field}\u0000${String(value)}`
      const current = counts.get(key)
      counts.set(key, {
        field,
        value,
        count: (current?.count ?? 0) + 1,
      })
    }
  }
  return [...counts.values()]
    .filter((suggestion) => suggestion.count > 0)
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field, 'zh-CN'))
    .slice(0, 5)
}

export function scenePanelAnalysisSummaryItems(asset: SpatialAsset) {
  if (asset.kind !== 'asset') return []
  if (asset.type !== 'analysis-result' && !asset.metadata?.analysisType) return []
  return analysisBusinessSummary(asset)
}

export function polygonOverlapTriageItems(asset: SpatialAsset): PolygonOverlapTriageItem[] {
  if (asset.kind !== 'asset' || asset.metadata?.analysisType !== 'polygon_overlap_screen') return []
  const renderData = metadataRecord(asset.metadata.renderData)
  const features = Array.isArray(renderData?.features) ? renderData.features : []
  const items: PolygonOverlapTriageItem[] = []
  for (const [index, feature] of features.entries()) {
    const properties = metadataRecord(metadataRecord(feature)?.properties)
    if (!properties) continue
    const candidateCount = numberValue(properties.overlapCandidateCount) ?? 0
    if (candidateCount <= 0) continue
    const riskLevel = String(properties.overlapRiskLevel ?? 'low')
    const areaSquareMeters = numberValue(properties.candidateAreaSquareMeters)
    const sourceFeatureIndex = integerValue(properties.sourceFeatureIndex) ?? index
    const reviewStatus = normalizedReviewStatus(properties.reviewStatus)
    const item: PolygonOverlapTriageItem = {
      label: String(properties.name ?? properties.label ?? `地块 ${index + 1}`),
      riskLevel,
      riskLabel: riskLabel(riskLevel),
      candidateCount,
      sourceAssetRef:
        typeof properties.sourceAssetRef === 'string' ? properties.sourceAssetRef : undefined,
      sourceFeatureIndex,
      reviewStatus,
      reviewStatusLabel:
        typeof properties.reviewStatusLabel === 'string'
          ? properties.reviewStatusLabel
          : reviewStatusLabel(reviewStatus),
      targetIndices: candidateTargetIndices(properties.candidateTargetFeatureIndices),
    }
    if (areaSquareMeters !== undefined) {
      item.areaSquareMeters = areaSquareMeters
    }
    items.push(item)
  }
  return items.sort(
    (a, b) =>
      riskRank(b.riskLevel) - riskRank(a.riskLevel) ||
      (b.areaSquareMeters ?? 0) - (a.areaSquareMeters ?? 0) ||
      b.candidateCount - a.candidateCount ||
      a.label.localeCompare(b.label, 'zh-CN'),
  )
}

export function filterPolygonOverlapTriageItems(
  items: PolygonOverlapTriageItem[],
  filter: PolygonOverlapTriageFilter = {},
) {
  const riskLevel = filter.riskLevel ?? 'all'
  const reviewStatus = filter.reviewStatus ?? 'all'
  const query = filter.query?.trim().toLowerCase() ?? ''
  return items.filter((item) => {
    if (riskLevel !== 'all' && item.riskLevel !== riskLevel) return false
    if (reviewStatus !== 'all' && item.reviewStatus !== reviewStatus) return false
    if (!query) return true
    const haystack = [
      item.label,
      item.riskLevel,
      item.riskLabel,
      item.candidateCount,
      item.areaSquareMeters,
      item.sourceAssetRef,
      item.sourceFeatureIndex,
      item.reviewStatus,
      item.reviewStatusLabel,
      item.targetIndices.join(','),
    ]
      .filter((value) => value !== undefined)
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
}

export function polygonOverlapReviewOverview(
  items: PolygonOverlapTriageItem[],
): PolygonOverlapReviewOverview {
  const pending = items.filter((item) => item.reviewStatus === 'pending').length
  const confirmed = items.filter((item) => item.reviewStatus === 'confirmed').length
  const excluded = items.filter((item) => item.reviewStatus === 'excluded').length
  const total = pending + confirmed + excluded
  return {
    pending,
    confirmed,
    excluded,
    total,
    label: `待 ${pending} / 确 ${confirmed} / 排 ${excluded}`,
  }
}

export function polygonOverlapReviewUpdateTargets(
  items: PolygonOverlapTriageItem[],
  reviewStatus: PolygonOverlapReviewStatus,
) {
  return items.filter(
    (item) => item.sourceFeatureIndex !== undefined && item.reviewStatus !== reviewStatus,
  )
}

export function scenePanelDeliverablesReviewPreview(
  manifest: SceneDeliverablesManifest,
): ScenePanelDeliverablesReviewPreview[] {
  const previews = new Map<string, ScenePanelDeliverablesReviewPreview>()
  for (const item of manifest.items) {
    if (!item.reviewSummary) continue
    const id = item.assetRef ?? item.id
    const preview = previews.get(id) ?? {
      id,
      label: item.label.replace(/\s+(GeoJSON|CSV)$/u, ''),
      pending: item.reviewSummary.pending,
      confirmed: item.reviewSummary.confirmed,
      excluded: item.reviewSummary.excluded,
      total: item.reviewSummary.total,
      completed: item.reviewSummary.completed,
      attachments: [],
    }
    preview.attachments.push({
      format: item.format,
      filenameHint: item.filenameHint,
    })
    previews.set(id, preview)
  }
  return [...previews.values()]
}

export function scenePanelBusinessOutcomeItems(
  assets: SpatialAsset[],
  reviewPreviews: ScenePanelDeliverablesReviewPreview[],
): ScenePanelBusinessOutcomeItem[] {
  const reviewByAssetRef = new Map(reviewPreviews.map((preview) => [preview.id, preview]))
  return assets
    .filter(
      (asset) =>
        asset.kind === 'asset' &&
        (asset.type === 'analysis-result' || !!asset.metadata?.analysisType),
    )
    .map((asset) => {
      const review = reviewByAssetRef.get(asset.ref)
      return {
        assetRef: asset.ref,
        label: asset.name || asset.id || asset.ref,
        analysisType: String(asset.metadata?.analysisType ?? asset.type),
        summaryItems: scenePanelAnalysisSummaryItems(asset).slice(0, 3),
        deliverableFormats:
          review?.attachments.map((attachment) => attachment.format.toUpperCase()) ?? [],
        pendingReviewCount: review?.pending ?? 0,
        completedReviewCount: review?.completed ?? 0,
        totalReviewCount: review?.total ?? 0,
      }
    })
    .sort(
      (left, right) =>
        right.pendingReviewCount - left.pendingReviewCount ||
        right.totalReviewCount - left.totalReviewCount ||
        left.label.localeCompare(right.label, 'zh-CN'),
    )
}

export function filterScenePanelBusinessOutcomeItems(
  items: ScenePanelBusinessOutcomeItem[],
  filter: ScenePanelBusinessOutcomeFilter = 'all',
) {
  return items
    .filter((item) => {
      if (filter === 'pending-review') return item.pendingReviewCount > 0
      if (filter === 'reviewed') return item.totalReviewCount > 0 && item.pendingReviewCount === 0
      return true
    })
    .sort(
      (left, right) =>
        right.pendingReviewCount - left.pendingReviewCount ||
        right.totalReviewCount - left.totalReviewCount ||
        left.label.localeCompare(right.label, 'zh-CN'),
    )
}

export function polygonOverlapRiskOverview(asset: SpatialAsset): PolygonOverlapRiskOverview | null {
  if (asset.kind !== 'asset' || asset.metadata?.analysisType !== 'polygon_overlap_screen')
    return null
  const riskCounts = metadataRecord(asset.metadata.riskLevelCounts)
  let high = integerValue(riskCounts?.high)
  let medium = integerValue(riskCounts?.medium)
  let low = integerValue(riskCounts?.low)

  if (high === undefined && medium === undefined && low === undefined) {
    const triage = polygonOverlapTriageItems(asset)
    high = triage.filter((item) => item.riskLevel === 'high').length
    medium = triage.filter((item) => item.riskLevel === 'medium').length
    low = triage.filter((item) => item.riskLevel === 'low').length
  }

  high = high ?? 0
  medium = medium ?? 0
  low = low ?? 0
  const total = high + medium + low
  if (total <= 0) return null
  const dominantLevel = high > 0 ? 'high' : medium > 0 ? 'medium' : 'low'
  return {
    high,
    medium,
    low,
    total,
    dominantLevel,
    label: `高 ${high} / 中 ${medium} / 低 ${low}`,
  }
}

function DetailRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 truncate text-foreground/90', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}

export function ScenePanel({
  scene,
  busy,
  onRefresh,
  onSelect,
  onFocus,
  onHighlightFeature,
  onSetFeatureReviewStatus,
  onRename,
  onVisibilityChange,
  onLockChange,
  onDelete,
  onAddAssetToMap,
  onCreateBuffer,
  onCreateNearest,
  onCreateSpatialJoin,
  onCreatePolygonOverlapScreen,
  onMeasureAsset,
  onCreateAttributeFilter,
  onExportAssetGeoJson,
  onExportAssetCsv,
  onSetAllVisibility,
  onClearAgentObjects,
  onClearScene,
  onExportScene,
  onExportMarkdownReport,
  onExportDeliverablesManifest,
  onExportDeliverablesPackage,
  onImportDeliverablesPackage,
  onImportScene,
  onImportGeoJson,
  onImportCsv,
  taskLinks = {},
  onOpenTaskStep,
}: ScenePanelProps) {
  const [query, setQuery] = useState('')
  const [triageQuery, setTriageQuery] = useState('')
  const [triageRiskFilter, setTriageRiskFilter] = useState<PolygonOverlapRiskFilter>('all')
  const [triageReviewFilter, setTriageReviewFilter] = useState<PolygonOverlapReviewFilter>('all')
  const [businessOutcomeFilter, setBusinessOutcomeFilter] =
    useState<ScenePanelBusinessOutcomeFilter>('all')
  const [highlightedTriageFeature, setHighlightedTriageFeature] =
    useState<HighlightedTriageFeature | null>(null)
  const assets = useMemo(() => sortAssets(Object.values(scene.assets)), [scene.assets])
  const assetDisplayModel = useMemo(() => buildScenePanelAssetDisplayModel(assets), [assets])
  const deliverables = useMemo(
    () => buildSceneDeliverablesManifest('current-session', scene, new Date(0).toISOString()),
    [scene],
  )
  const deliverableReviewPreviews = useMemo(
    () => scenePanelDeliverablesReviewPreview(deliverables),
    [deliverables],
  )
  const businessOutcomeItems = useMemo(
    () => scenePanelBusinessOutcomeItems(assets, deliverableReviewPreviews),
    [assets, deliverableReviewPreviews],
  )
  const filteredBusinessOutcomeItems = useMemo(
    () => filterScenePanelBusinessOutcomeItems(businessOutcomeItems, businessOutcomeFilter),
    [businessOutcomeFilter, businessOutcomeItems],
  )
  const displayAssets = assetDisplayModel.assets
  const visibleAssets = displayAssets.filter((asset) => asset.visible !== false).length
  const layers = displayAssets.filter((asset) => asset.kind === 'layer').length
  const entities = displayAssets.length - layers
  const filteredAssets = query
    ? displayAssets.filter((asset) => matchesAsset(asset, query))
    : displayAssets
  const groups = filteredAssets.reduce<Record<string, SpatialAsset[]>>((acc, asset) => {
    const label = assetGroupLabel(asset)
    acc[label] = acc[label] ?? []
    acc[label].push(asset)
    return acc
  }, {})

  const highlightTriageFeature = (asset: SpatialAsset, item: PolygonOverlapTriageItem): void => {
    if (!onHighlightFeature) {
      void onFocus(asset)
      return
    }
    void Promise.resolve(onHighlightFeature(asset, item.sourceFeatureIndex)).then(() => {
      setHighlightedTriageFeature({
        assetRef: asset.ref,
        featureIndex: item.sourceFeatureIndex,
        label: item.label,
      })
    })
  }

  const clearTriageHighlight = (asset: SpatialAsset): void => {
    if (!onHighlightFeature) {
      setHighlightedTriageFeature(null)
      return
    }
    void Promise.resolve(onHighlightFeature(asset, undefined, { clear: true })).then(() => {
      setHighlightedTriageFeature(null)
    })
  }

  const setTriageReviewStatus = (
    asset: SpatialAsset,
    item: PolygonOverlapTriageItem,
    reviewStatus: PolygonOverlapReviewStatus,
  ): void => {
    if (!onSetFeatureReviewStatus || item.sourceFeatureIndex === undefined) return
    void onSetFeatureReviewStatus(asset, item.sourceFeatureIndex, reviewStatus)
  }

  const setTriageReviewStatusForItems = (
    asset: SpatialAsset,
    items: PolygonOverlapTriageItem[],
    reviewStatus: PolygonOverlapReviewStatus,
  ): void => {
    if (!onSetFeatureReviewStatus) return
    const targets = polygonOverlapReviewUpdateTargets(items, reviewStatus)
    if (targets.length === 0) return
    void Promise.all(
      targets.map((item) =>
        onSetFeatureReviewStatus(asset, item.sourceFeatureIndex as number, reviewStatus),
      ),
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-primary" aria-hidden="true" />
          <div className="mr-auto min-w-0">
            <p className="text-xs font-semibold text-foreground">场景对象</p>
            <p className="text-[10px] text-muted-foreground">
              {assets.length > 0
                ? `${displayAssets.length} 个对象 · ${visibleAssets} 可见 · ${layers} 图层 · ${entities} 实体${
                    assetDisplayModel.foldedAssets.length > 0
                      ? ` · 已折叠 ${assetDisplayModel.foldedAssets.length} 个实现项`
                      : ''
                  }`
                : '暂无对象'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={busy}
            onClick={() => void onRefresh()}
            title="刷新场景对象"
            aria-label="刷新场景对象"
          >
            <RefreshCcw className={cn('size-3.5', busy && 'animate-spin')} aria-hidden="true" />
          </Button>
        </div>

        {assets.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索名称、类型、来源或 ID..."
                className="h-8 rounded-lg bg-muted/30 pl-8 text-xs"
              />
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <PackageCheck className="size-3.5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">任务成果包</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {deliverables.counts.totalDeliverables} 个成果项 · GeoJSON{' '}
                        {deliverables.counts.geojson} · CSV {deliverables.counts.csv} · 分析结果{' '}
                        {deliverables.counts.analysisResults}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={busy || assets.length === 0}
                        onClick={() => void onExportDeliverablesPackage()}
                      >
                        <Download className="size-3" aria-hidden="true" />
                        导出 ZIP
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={busy || assets.length === 0}
                        onClick={() => void onExportDeliverablesManifest()}
                      >
                        清单
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={busy}
                        onClick={() => void onImportDeliverablesPackage()}
                      >
                        导入 ZIP
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {deliverables.items.slice(0, 4).map((item) => (
                      <span
                        key={item.id}
                        className="max-w-full truncate rounded-full border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        title={item.description}
                      >
                        {item.label}
                      </span>
                    ))}
                    {deliverables.items.length > 4 && (
                      <span className="rounded-full border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        +{deliverables.items.length - 4}
                      </span>
                    )}
                  </div>
                  {deliverableReviewPreviews.length > 0 && (
                    <div className="mt-2 space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 p-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-foreground">复核摘要</span>
                        <span className="text-[10px] text-muted-foreground">
                          {deliverableReviewPreviews.length} 个业务成果
                        </span>
                      </div>
                      {deliverableReviewPreviews.slice(0, 2).map((preview) => (
                        <div
                          key={preview.id}
                          className="rounded-md border border-border/60 bg-background/45 px-1.5 py-1 text-[10px]"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                              {preview.label}
                            </span>
                            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">
                              {preview.completed}/{preview.total}
                            </Badge>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
                            <span>
                              待 {preview.pending} · 确 {preview.confirmed} · 排 {preview.excluded}
                            </span>
                            <span>
                              附件{' '}
                              {preview.attachments
                                .map((attachment) => attachment.format.toUpperCase())
                                .join(' / ')}
                            </span>
                          </div>
                        </div>
                      ))}
                      {deliverableReviewPreviews.length > 2 && (
                        <p className="text-[10px] text-muted-foreground">
                          另有 {deliverableReviewPreviews.length - 2} 个复核成果将在导出包 README
                          中汇总。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {businessOutcomeItems.length > 0 && (
              <div className="rounded-xl border border-border bg-card/70 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">业务成果</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {filteredBusinessOutcomeItems.length} / {businessOutcomeItems.length}{' '}
                      个分析成果 · 可直接打开、复核或导出
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => void onExportDeliverablesPackage()}
                  >
                    <Download className="size-3" aria-hidden="true" />
                    导出
                  </Button>
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {[
                    { value: 'all' as const, label: '全部' },
                    { value: 'pending-review' as const, label: '待复核' },
                    { value: 'reviewed' as const, label: '已复核' },
                    { value: 'analysis' as const, label: '分析结果' },
                  ].map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={businessOutcomeFilter === option.value ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 rounded-full px-2 text-[10px]"
                      disabled={busy}
                      onClick={() => setBusinessOutcomeFilter(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {filteredBusinessOutcomeItems.slice(0, 3).map((item) => {
                    const asset = scene.assets[item.assetRef]
                    return (
                      <div
                        key={item.assetRef}
                        className="rounded-lg border border-border/70 bg-background/45 p-2 text-[10px]"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                            {item.label}
                          </span>
                          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[9px]">
                            {item.analysisType}
                          </Badge>
                          {item.totalReviewCount > 0 && (
                            <Badge
                              variant={item.pendingReviewCount > 0 ? 'outline' : 'default'}
                              className="shrink-0 px-1.5 py-0 text-[9px]"
                            >
                              复核 {item.completedReviewCount}/{item.totalReviewCount}
                            </Badge>
                          )}
                        </div>
                        {item.summaryItems.length > 0 && (
                          <p className="mt-1 line-clamp-2 text-muted-foreground">
                            {item.summaryItems.join('；')}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {item.deliverableFormats.length > 0 && (
                            <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-muted-foreground">
                              附件 {item.deliverableFormats.join(' / ')}
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="ml-auto h-6 rounded-full px-2 text-[10px]"
                            disabled={busy || !asset}
                            onClick={() => {
                              if (asset) void onSelect(asset)
                            }}
                          >
                            打开
                          </Button>
                          {item.pendingReviewCount > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 rounded-full border-amber-500/25 bg-amber-500/5 px-2 text-[10px] text-amber-200"
                              disabled={busy || !asset}
                              onClick={() => {
                                setTriageReviewFilter('pending')
                                if (asset) void onSelect(asset)
                              }}
                            >
                              待复核 {item.pendingReviewCount}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {filteredBusinessOutcomeItems.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border px-2 py-1.5 text-[10px] text-muted-foreground">
                      当前筛选下暂无业务成果。
                    </p>
                  )}
                  {filteredBusinessOutcomeItems.length > 3 && (
                    <p className="text-[10px] text-muted-foreground">
                      另有 {filteredBusinessOutcomeItems.length - 3}{' '}
                      个业务成果，可在对象列表中继续查看。
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={busy || assets.length === 0}
                onClick={() => void onSetAllVisibility(true)}
              >
                全部显示
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={busy || assets.length === 0}
                onClick={() => void onSetAllVisibility(false)}
              >
                全部隐藏
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                disabled={busy || assets.length === 0}
                onClick={() => void onClearAgentObjects()}
              >
                清空 AI 对象
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                disabled={busy || assets.length === 0}
                onClick={() => void onClearScene()}
              >
                清空场景
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={busy}
                onClick={() => void onImportDeliverablesPackage()}
              >
                <Upload className="size-3" aria-hidden="true" />
                导入 ZIP
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={busy}
                onClick={() => void onImportCsv()}
              >
                <Upload className="size-3" aria-hidden="true" />
                导入 CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={busy}
                onClick={() => void onImportGeoJson()}
              >
                <Upload className="size-3" aria-hidden="true" />
                导入 GeoJSON
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={busy}
                onClick={() => void onImportScene()}
              >
                <Upload className="size-3" aria-hidden="true" />
                导入场景
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={busy || assets.length === 0}
                onClick={() => void onExportScene()}
              >
                <Download className="size-3" aria-hidden="true" />
                导出 JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={busy || assets.length === 0}
                onClick={() => void onExportMarkdownReport()}
              >
                <Download className="size-3" aria-hidden="true" />
                导出报告
              </Button>
            </div>
          </div>
        )}
      </header>

      {assets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-border bg-muted/30 text-primary">
            <Layers className="size-5" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">当前场景还没有对象</h3>
          <p className="mt-2 max-w-64 text-xs leading-5 text-muted-foreground">
            让 AI 添加标注、路线或图层后，这里会显示可管理的场景对象。
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onImportDeliverablesPackage()}
            >
              <Upload aria-hidden="true" />
              导入 ZIP
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onImportCsv()}
            >
              <Upload aria-hidden="true" />
              导入 CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onImportGeoJson()}
            >
              <Upload aria-hidden="true" />
              导入 GeoJSON
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onImportScene()}
            >
              <Upload aria-hidden="true" />
              导入场景
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onRefresh()}
            >
              <RefreshCcw aria-hidden="true" />
              刷新
            </Button>
          </div>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <Search className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">没有匹配的对象</h3>
          <p className="mt-2 max-w-64 text-xs leading-5 text-muted-foreground">
            换个关键词，或清空搜索后查看全部场景对象。
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setQuery('')}
          >
            清空搜索
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          {Object.entries(groups).map(([group, groupAssets]) => (
            <section key={group} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[11px] font-semibold text-muted-foreground">{group}</h3>
                <span className="text-[10px] text-muted-foreground">{groupAssets.length}</span>
              </div>
              {groupAssets.map((asset) => {
                const visible = asset.visible !== false
                const selected = scene.activeObjectRef === asset.ref
                const recent = scene.recentObjectRefs?.includes(asset.ref) ?? false
                const foldedChildren = assetDisplayModel.foldedByParentRef[asset.ref] ?? []
                const taskLink = taskLinks[asset.ref]
                const nearestTargets = nearestTargetCandidates(asset, assets)
                const spatialJoin = spatialJoinCandidates(asset, assets)
                const polygonOverlapTargets = polygonOverlapCandidates(asset, assets)
                const attributeFilters = attributeFilterSuggestions(asset)
                const analysisSummaryItems = scenePanelAnalysisSummaryItems(asset)
                const polygonOverlapTriage = polygonOverlapTriageItems(asset)
                const polygonOverlapReview = polygonOverlapReviewOverview(polygonOverlapTriage)
                const filteredPolygonOverlapTriage = filterPolygonOverlapTriageItems(
                  polygonOverlapTriage,
                  {
                    query: triageQuery,
                    riskLevel: triageRiskFilter,
                    reviewStatus: triageReviewFilter,
                  },
                )
                const polygonOverlapRisk = polygonOverlapRiskOverview(asset)
                const confirmablePolygonOverlapTriage = polygonOverlapReviewUpdateTargets(
                  filteredPolygonOverlapTriage,
                  'confirmed',
                )
                const excludablePolygonOverlapTriage = polygonOverlapReviewUpdateTargets(
                  filteredPolygonOverlapTriage,
                  'excluded',
                )
                return (
                  <article
                    key={asset.ref}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => void onSelect(asset)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        void onSelect(asset)
                      }
                    }}
                    className={cn(
                      'cursor-pointer rounded-lg border border-border bg-card/70 p-3 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      selected &&
                        'border-primary/60 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.22)]',
                      !visible && 'opacity-60',
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        {assetIcon(asset)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {asset.name || asset.id}
                          </p>
                          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[9px]">
                            {assetKindLabel(asset)}
                          </Badge>
                          {!visible && (
                            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">
                              已隐藏
                            </Badge>
                          )}
                          {selected && (
                            <Badge variant="default" className="shrink-0 px-1.5 py-0 text-[9px]">
                              当前
                            </Badge>
                          )}
                          {!selected && recent && (
                            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">
                              最近
                            </Badge>
                          )}
                          {asset.locked && (
                            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">
                              已锁定
                            </Badge>
                          )}
                          {polygonOverlapRisk && (
                            <Badge
                              variant={
                                polygonOverlapRisk.dominantLevel === 'high'
                                  ? 'destructive'
                                  : polygonOverlapRisk.dominantLevel === 'medium'
                                    ? 'default'
                                    : 'secondary'
                              }
                              className="shrink-0 px-1.5 py-0 text-[9px]"
                              title={`疑似冲突风险：${polygonOverlapRisk.label}`}
                            >
                              {polygonOverlapRisk.label}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          {assetSubtitle(asset)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                          <span className="rounded-full border border-border px-1.5 py-0.5">
                            来源：{sourceLabel(asset)}
                          </span>
                          {asset.lastCallId && (
                            <span className="max-w-full truncate rounded-full border border-border px-1.5 py-0.5">
                              调用：{asset.lastCallId}
                            </span>
                          )}
                          {foldedChildren.length > 0 && (
                            <span className="rounded-full border border-border px-1.5 py-0.5">
                              已折叠 {foldedChildren.length} 个实现项
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {selected && (
                      <div className="mt-3 rounded-lg border border-border/70 bg-background/55 p-2.5 text-[10px]">
                        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                          <Info className="size-3.5 text-primary" aria-hidden="true" />
                          对象详情
                        </div>
                        <dl className="space-y-1.5">
                          <DetailRow label="引用" value={asset.ref} mono />
                          <DetailRow label="ID" value={asset.id} mono />
                          <DetailRow
                            label="类型"
                            value={`${assetKindLabel(asset)} / ${asset.type}`}
                          />
                          <DetailRow label="来源" value={sourceLabel(asset)} />
                          <DetailRow label="状态" value={assetStatusLabel(asset)} />
                          <DetailRow label="坐标" value={assetPositionLabel(asset)} mono />
                          <DetailRow label="数据" value={asset.uri ?? asset.dataRefId} mono />
                          <DetailRow label="坐标系" value={asset.crs} mono />
                          <DetailRow label="几何" value={asset.geometryType} />
                          <DetailRow
                            label="要素数"
                            value={
                              asset.featureCount === undefined
                                ? undefined
                                : asset.featureCount.toLocaleString('zh-CN')
                            }
                          />
                          <DetailRow label="范围" value={assetBboxLabel(asset)} mono />
                          <DetailRow label="字段" value={assetSchemaLabel(asset)} mono />
                          <DetailRow label="渲染" value={assetRenderLabel(asset)} mono />
                          <DetailRow label="调用" value={asset.lastCallId} mono />
                          {analysisSummaryItems.length > 0 && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">分析摘要</dt>
                              <dd className="min-w-0 space-y-1">
                                {analysisSummaryItems.map((item) => (
                                  <div
                                    key={item}
                                    className="rounded border border-primary/20 bg-primary/5 px-1.5 py-1 text-foreground"
                                  >
                                    {item}
                                  </div>
                                ))}
                              </dd>
                            </div>
                          )}
                          {polygonOverlapTriage.length > 0 && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">冲突清单</dt>
                              <dd className="min-w-0 space-y-1">
                                <div className="space-y-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-1.5">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {[
                                      { value: 'all' as const, label: '全部' },
                                      { value: 'high' as const, label: '高' },
                                      { value: 'medium' as const, label: '中' },
                                      { value: 'low' as const, label: '低' },
                                    ].map((option) => (
                                      <Button
                                        key={option.value}
                                        type="button"
                                        variant={
                                          triageRiskFilter === option.value ? 'default' : 'outline'
                                        }
                                        size="sm"
                                        className="h-6 rounded-full px-2 text-[10px]"
                                        disabled={busy}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setTriageRiskFilter(option.value)
                                        }}
                                      >
                                        {option.label}
                                      </Button>
                                    ))}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="ml-auto h-6 rounded-full px-2 text-[10px]"
                                      disabled={busy}
                                      title="导出完整冲突清单 CSV"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        void onExportAssetCsv(asset)
                                      }}
                                    >
                                      <Download className="size-3" aria-hidden="true" />
                                      CSV
                                    </Button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="mr-1 rounded-full border border-border/70 bg-background/55 px-2 py-0.5 text-[10px] text-muted-foreground">
                                      {polygonOverlapReview.label}
                                    </span>
                                    {[
                                      { value: 'all' as const, label: '全部' },
                                      { value: 'pending' as const, label: '待复核' },
                                      { value: 'confirmed' as const, label: '已确认' },
                                      { value: 'excluded' as const, label: '已排除' },
                                    ].map((option) => (
                                      <Button
                                        key={option.value}
                                        type="button"
                                        variant={
                                          triageReviewFilter === option.value
                                            ? 'default'
                                            : 'outline'
                                        }
                                        size="sm"
                                        className="h-6 rounded-full px-2 text-[10px]"
                                        disabled={busy}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setTriageReviewFilter(option.value)
                                        }}
                                      >
                                        {option.label}
                                      </Button>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-6 rounded-full px-2 text-[10px]"
                                      disabled={
                                        busy ||
                                        !onSetFeatureReviewStatus ||
                                        confirmablePolygonOverlapTriage.length === 0
                                      }
                                      title={`将当前筛选命中的 ${confirmablePolygonOverlapTriage.length} 条标记为已确认`}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setTriageReviewStatusForItems(
                                          asset,
                                          filteredPolygonOverlapTriage,
                                          'confirmed',
                                        )
                                      }}
                                    >
                                      批量确认当前筛选
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-6 rounded-full px-2 text-[10px]"
                                      disabled={
                                        busy ||
                                        !onSetFeatureReviewStatus ||
                                        excludablePolygonOverlapTriage.length === 0
                                      }
                                      title={`将当前筛选命中的 ${excludablePolygonOverlapTriage.length} 条标记为已排除`}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setTriageReviewStatusForItems(
                                          asset,
                                          filteredPolygonOverlapTriage,
                                          'excluded',
                                        )
                                      }}
                                    >
                                      批量排除当前筛选
                                    </Button>
                                  </div>
                                  <div className="relative">
                                    <Search
                                      className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                    <Input
                                      value={triageQuery}
                                      onChange={(event) => setTriageQuery(event.target.value)}
                                      onClick={(event) => event.stopPropagation()}
                                      placeholder="搜索地块、风险或目标索引..."
                                      className="h-7 rounded-lg bg-background/70 pl-7 text-[10px]"
                                    />
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">
                                    当前显示 {filteredPolygonOverlapTriage.length} /{' '}
                                    {polygonOverlapTriage.length} 条，完整属性可导出 CSV 交付。
                                  </p>
                                  {highlightedTriageFeature?.assetRef === asset.ref && (
                                    <div className="flex min-w-0 items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-1.5 py-1 text-[10px]">
                                      <Crosshair
                                        className="size-3 shrink-0 text-amber-300"
                                        aria-hidden="true"
                                      />
                                      <span className="min-w-0 flex-1 truncate text-foreground">
                                        当前高亮：{highlightedTriageFeature.label}
                                        {highlightedTriageFeature.featureIndex !== undefined
                                          ? `（源要素索引 ${highlightedTriageFeature.featureIndex}）`
                                          : ''}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 shrink-0 rounded-full px-2 text-[10px]"
                                        disabled={busy}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          clearTriageHighlight(asset)
                                        }}
                                      >
                                        清除
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                {filteredPolygonOverlapTriage.slice(0, 5).map((item, index) => {
                                  const highlighted =
                                    highlightedTriageFeature?.assetRef === asset.ref &&
                                    highlightedTriageFeature.featureIndex ===
                                      item.sourceFeatureIndex
                                  return (
                                    <div
                                      key={`${item.label}:${index}`}
                                      className={cn(
                                        'rounded border border-amber-500/25 bg-amber-500/5 px-1.5 py-1 text-foreground',
                                        highlighted &&
                                          'border-amber-300/60 bg-amber-300/15 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]',
                                      )}
                                    >
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <Badge
                                          variant={
                                            item.riskLevel === 'high'
                                              ? 'destructive'
                                              : item.riskLevel === 'medium'
                                                ? 'default'
                                                : 'secondary'
                                          }
                                          className="shrink-0 px-1.5 py-0 text-[9px]"
                                        >
                                          {item.riskLabel}风险
                                        </Badge>
                                        <span className="min-w-0 truncate font-medium">
                                          {item.label}
                                        </span>
                                        {highlighted && (
                                          <Badge
                                            variant="outline"
                                            className="shrink-0 border-amber-300/50 px-1.5 py-0 text-[9px] text-amber-200"
                                          >
                                            高亮中
                                          </Badge>
                                        )}
                                        <Badge
                                          variant={
                                            item.reviewStatus === 'confirmed'
                                              ? 'default'
                                              : item.reviewStatus === 'excluded'
                                                ? 'secondary'
                                                : 'outline'
                                          }
                                          className="shrink-0 px-1.5 py-0 text-[9px]"
                                        >
                                          {item.reviewStatusLabel}
                                        </Badge>
                                        <Button
                                          type="button"
                                          variant={highlighted ? 'outline' : 'ghost'}
                                          size="icon-xs"
                                          className="ml-auto size-6 shrink-0"
                                          disabled={busy}
                                          title="在地图上高亮这条疑似冲突"
                                          aria-label={`定位 ${item.label}`}
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            highlightTriageFeature(asset, item)
                                          }}
                                        >
                                          <Crosshair className="size-3" aria-hidden="true" />
                                        </Button>
                                      </div>
                                      <div className="mt-1 text-muted-foreground">
                                        {item.sourceFeatureIndex !== undefined
                                          ? `源要素索引 ${item.sourceFeatureIndex} · `
                                          : ''}
                                        命中 {item.candidateCount} 个边界
                                        {item.targetIndices.length > 0
                                          ? ` · 目标索引 ${item.targetIndices.join(', ')}`
                                          : ''}
                                        {item.areaSquareMeters !== undefined
                                          ? ` · 面积 ${item.areaSquareMeters.toLocaleString(
                                              'zh-CN',
                                              {
                                                maximumFractionDigits: 2,
                                              },
                                            )}㎡`
                                          : ''}
                                      </div>
                                      <div className="mt-1.5 flex flex-wrap gap-1">
                                        {[
                                          { value: 'pending' as const, label: '待复核' },
                                          { value: 'confirmed' as const, label: '确认' },
                                          { value: 'excluded' as const, label: '排除' },
                                        ].map((option) => (
                                          <Button
                                            key={option.value}
                                            type="button"
                                            variant={
                                              item.reviewStatus === option.value
                                                ? 'default'
                                                : 'outline'
                                            }
                                            size="sm"
                                            className="h-5 rounded-full px-2 text-[10px]"
                                            disabled={
                                              busy ||
                                              !onSetFeatureReviewStatus ||
                                              item.sourceFeatureIndex === undefined
                                            }
                                            title={`标记为${option.label}`}
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setTriageReviewStatus(asset, item, option.value)
                                            }}
                                          >
                                            {option.label}
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                                {filteredPolygonOverlapTriage.length === 0 && (
                                  <p className="rounded border border-border bg-muted/20 px-1.5 py-1 text-[10px] text-muted-foreground">
                                    当前筛选条件下没有冲突项。
                                  </p>
                                )}
                                {filteredPolygonOverlapTriage.length > 5 && (
                                  <p className="text-[10px] text-muted-foreground">
                                    另有 {filteredPolygonOverlapTriage.length - 5}{' '}
                                    个疑似冲突地块，可继续筛选或导出 CSV / GeoJSON 查看完整清单。
                                  </p>
                                )}
                              </dd>
                            </div>
                          )}
                          {attributeFilters.length > 0 && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">属性筛选</dt>
                              <dd className="min-w-0 space-y-1">
                                {attributeFilters.map((filter) => (
                                  <Button
                                    key={`${filter.field}:${String(filter.value)}`}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-auto max-w-full justify-start rounded-lg px-2 py-1 text-left text-[10px]"
                                    disabled={busy}
                                    title={`筛选 ${filter.field} = ${String(filter.value)}`}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void onCreateAttributeFilter(
                                        asset,
                                        filter.field,
                                        filter.value,
                                      )
                                    }}
                                  >
                                    <Search className="size-3 shrink-0" aria-hidden="true" />
                                    <span className="min-w-0 truncate">
                                      {filter.field} = {String(filter.value)}（{filter.count}）
                                    </span>
                                  </Button>
                                ))}
                              </dd>
                            </div>
                          )}
                          {canCreatePointBuffer(asset) && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">缓冲区</dt>
                              <dd className="flex min-w-0 flex-wrap gap-1">
                                {[100, 500, 1000].map((distance) => (
                                  <Button
                                    key={distance}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 rounded-full px-2 text-[10px]"
                                    disabled={busy}
                                    title={`生成 ${distance >= 1000 ? `${distance / 1000}km` : `${distance}m`} 缓冲区`}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void onCreateBuffer(asset, distance)
                                    }}
                                  >
                                    {distance >= 1000 ? `${distance / 1000}km` : `${distance}m`}
                                  </Button>
                                ))}
                              </dd>
                            </div>
                          )}
                          {nearestTargets.length > 0 && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">最近邻</dt>
                              <dd className="min-w-0 space-y-1">
                                {nearestTargets.slice(0, 5).map((target) => (
                                  <Button
                                    key={target.ref}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-auto max-w-full justify-start rounded-lg px-2 py-1 text-left text-[10px]"
                                    disabled={busy}
                                    title={`查找 ${asset.name ?? asset.id} 到 ${target.name ?? target.id} 的最近邻`}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void onCreateNearest(asset, target)
                                    }}
                                  >
                                    <Waypoints className="size-3 shrink-0" aria-hidden="true" />
                                    <span className="min-w-0 truncate">
                                      → {target.name ?? target.id}
                                    </span>
                                  </Button>
                                ))}
                                {nearestTargets.length > 5 && (
                                  <p className="text-[10px] text-muted-foreground">
                                    另有 {nearestTargets.length - 5} 个点资产，可通过 AI
                                    指定目标资产分析。
                                  </p>
                                )}
                              </dd>
                            </div>
                          )}
                          {isMeasurableGeoJsonAsset(asset) && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">量测</dt>
                              <dd className="min-w-0">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 rounded-full px-2 text-[10px]"
                                  disabled={busy}
                                  title={`量测 ${asset.name ?? asset.id} 的长度、面积和周长`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void onMeasureAsset(asset)
                                  }}
                                >
                                  <Ruler className="size-3" aria-hidden="true" />
                                  计算长度/面积
                                </Button>
                              </dd>
                            </div>
                          )}
                          {spatialJoin.candidates.length > 0 && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">
                                {spatialJoin.mode === 'point-to-polygons' ? '区域统计' : '点统计'}
                              </dt>
                              <dd className="min-w-0 space-y-1">
                                {spatialJoin.candidates.slice(0, 5).map((target) => {
                                  const pointAsset =
                                    spatialJoin.mode === 'point-to-polygons' ? asset : target
                                  const polygonAsset =
                                    spatialJoin.mode === 'point-to-polygons' ? target : asset
                                  return (
                                    <Button
                                      key={target.ref}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-auto max-w-full justify-start rounded-lg px-2 py-1 text-left text-[10px]"
                                      disabled={busy}
                                      title={`统计 ${polygonAsset.name ?? polygonAsset.id} 内的 ${pointAsset.name ?? pointAsset.id}`}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        void onCreateSpatialJoin(pointAsset, polygonAsset)
                                      }}
                                    >
                                      <MapPin className="size-3 shrink-0" aria-hidden="true" />
                                      <span className="min-w-0 truncate">
                                        {spatialJoin.mode === 'point-to-polygons'
                                          ? `按 ${target.name ?? target.id} 统计`
                                          : `统计 ${target.name ?? target.id}`}
                                      </span>
                                    </Button>
                                  )
                                })}
                                {spatialJoin.candidates.length > 5 && (
                                  <p className="text-[10px] text-muted-foreground">
                                    另有 {spatialJoin.candidates.length - 5} 个可统计资产，可通过 AI
                                    指定目标资产分析。
                                  </p>
                                )}
                              </dd>
                            </div>
                          )}
                          {polygonOverlapTargets.length > 0 && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">合规初筛</dt>
                              <dd className="min-w-0 space-y-1">
                                {polygonOverlapTargets.slice(0, 5).map((target) => (
                                  <Button
                                    key={target.ref}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-auto max-w-full justify-start rounded-lg px-2 py-1 text-left text-[10px]"
                                    disabled={busy}
                                    title={`筛查 ${asset.name ?? asset.id} 与 ${target.name ?? target.id} 的疑似重叠/压占`}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void onCreatePolygonOverlapScreen(asset, target)
                                    }}
                                  >
                                    <Layers className="size-3 shrink-0" aria-hidden="true" />
                                    <span className="min-w-0 truncate">
                                      对比 {target.name ?? target.id}
                                    </span>
                                  </Button>
                                ))}
                                {polygonOverlapTargets.length > 5 && (
                                  <p className="text-[10px] text-muted-foreground">
                                    另有 {polygonOverlapTargets.length - 5} 个面资产，可通过 AI
                                    指定目标边界筛查。
                                  </p>
                                )}
                              </dd>
                            </div>
                          )}
                          {taskLink && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">任务步骤</dt>
                              <dd className="min-w-0">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-auto max-w-full justify-start gap-1.5 rounded-lg px-2 py-1 text-left text-[10px]"
                                  title={`查看任务步骤：${taskLink.stepTitle}`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void onOpenTaskStep?.(taskLink)
                                  }}
                                >
                                  <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                                  <span className="min-w-0">
                                    <span className="block truncate">
                                      {taskLink.stepIndex + 1}. {taskLink.stepTitle}
                                    </span>
                                    <span className="block truncate text-muted-foreground">
                                      {taskLink.runGoal}
                                    </span>
                                  </span>
                                </Button>
                              </dd>
                            </div>
                          )}
                          {foldedChildren.length > 0 && (
                            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <dt className="text-muted-foreground">实现项</dt>
                              <dd className="min-w-0 space-y-1">
                                {foldedChildren.map((child) => (
                                  <div
                                    key={child.ref}
                                    className="truncate rounded border border-border/70 px-1.5 py-1 font-mono text-foreground/80"
                                    title={`${child.ref} · ${child.type}`}
                                  >
                                    {child.ref} · {child.type}
                                  </div>
                                ))}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={busy}
                        title="复制对象引用"
                        aria-label={`复制 ${asset.name || asset.id} 的对象引用`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void navigator.clipboard?.writeText(asset.ref)
                        }}
                      >
                        <Copy aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={busy}
                        title="重命名对象"
                        aria-label={`重命名 ${asset.name || asset.id}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void onRename(asset)
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={busy}
                        title="定位到对象"
                        aria-label={`定位到 ${asset.name || asset.id}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void onFocus(asset)
                        }}
                      >
                        <Crosshair aria-hidden="true" />
                      </Button>
                      {asset.kind === 'asset' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy || asset.metadata?.renderTool !== 'addGeoJsonLayer'}
                          title="添加到地图"
                          aria-label={`添加 ${asset.name || asset.id} 到地图`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void onAddAssetToMap(asset)
                          }}
                        >
                          <Layers aria-hidden="true" />
                        </Button>
                      )}
                      {asset.kind === 'asset' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy || !canCreatePointBuffer(asset)}
                          title="生成 500m 缓冲区"
                          aria-label={`为 ${asset.name || asset.id} 生成 500m 缓冲区`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void onCreateBuffer(asset)
                          }}
                        >
                          <Waypoints aria-hidden="true" />
                        </Button>
                      )}
                      {asset.kind === 'asset' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy || !isMeasurableGeoJsonAsset(asset)}
                          title="量测长度/面积"
                          aria-label={`量测 ${asset.name || asset.id} 的长度和面积`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void onMeasureAsset(asset)
                          }}
                        >
                          <Ruler aria-hidden="true" />
                        </Button>
                      )}
                      {asset.kind === 'asset' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy || !asset.metadata?.renderData}
                          title="导出 GeoJSON"
                          aria-label={`导出 ${asset.name || asset.id} 的 GeoJSON`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void onExportAssetGeoJson(asset)
                          }}
                        >
                          <Download aria-hidden="true" />
                        </Button>
                      )}
                      {asset.kind === 'asset' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy || !asset.metadata?.renderData}
                          title="导出 CSV"
                          aria-label={`导出 ${asset.name || asset.id} 的 CSV`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void onExportAssetCsv(asset)
                          }}
                        >
                          <Download aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={busy || asset.kind === 'asset'}
                        title={visible ? '隐藏对象' : '显示对象'}
                        aria-label={`${visible ? '隐藏' : '显示'} ${asset.name || asset.id}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void onVisibilityChange(asset, !visible)
                        }}
                      >
                        {visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={busy}
                        title={asset.locked ? '解锁对象' : '锁定对象'}
                        aria-label={`${asset.locked ? '解锁' : '锁定'} ${asset.name || asset.id}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void onLockChange(asset, !asset.locked)
                        }}
                      >
                        {asset.locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={busy || asset.locked}
                        title={asset.locked ? '对象已锁定，先解锁再删除' : '删除对象'}
                        aria-label={`删除 ${asset.name || asset.id}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation()
                          void onDelete(asset)
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
