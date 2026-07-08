import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Info,
  Layers,
  Lock,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  RefreshCcw,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
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

type ScenePanelGroupMode = 'kind' | 'source'
type ScenePanelSortMode = 'default' | 'name' | 'kind' | 'recent'

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
  if (asset.kind === 'asset') return '数据源'
  if (asset.kind === 'layer') return '图层'
  return '独立对象'
}

function scenePanelGroupLabel(asset: SpatialAsset, mode: ScenePanelGroupMode) {
  if (mode === 'source') return sourceLabel(asset) || '未标记来源'
  return assetGroupLabel(asset)
}

function assetIcon(asset: SpatialAsset) {
  if (asset.kind === 'asset') return <Info className="size-3.5" aria-hidden="true" />
  if (asset.kind === 'layer') return <Layers className="size-3.5" aria-hidden="true" />
  if (asset.type === 'polyline' || asset.type === 'flight') {
    return <Waypoints className="size-3.5" aria-hidden="true" />
  }
  return <MapPin className="size-3.5" aria-hidden="true" />
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

function entityLayerPrefix(asset: SpatialAsset) {
  const type = asset.type.trim().toLowerCase()
  if (type === 'point') return 'marker'
  if (
    [
      'marker',
      'polyline',
      'polygon',
      'model',
      'billboard',
      'box',
      'cylinder',
      'ellipse',
      'rectangle',
      'wall',
      'corridor',
    ].includes(type)
  ) {
    return type
  }
  return undefined
}

function layerBelongsToEntity(layer: SpatialAsset, entity: SpatialAsset) {
  if (layer.kind !== 'layer' || entity.kind !== 'entity') return false
  const prefix = entityLayerPrefix(entity)
  if (
    prefix &&
    (layer.id === `${prefix}_${entity.id}` || layer.dataRefId === `${prefix}_${entity.id}`)
  ) {
    return true
  }

  const sameCall =
    layer.lastCallId !== undefined &&
    entity.lastCallId !== undefined &&
    layer.lastCallId === entity.lastCallId
  const sameName = normalizedAssetName(layer) === normalizedAssetName(entity)
  const sameDataRef =
    layer.dataRefId !== undefined &&
    entity.dataRefId !== undefined &&
    layer.dataRefId === entity.dataRefId

  if (sameDataRef || (sameCall && sameName)) return true
  if (sameCall && entity.type.trim().toLowerCase() === 'label' && layer.id.startsWith('label_')) {
    return true
  }
  return false
}

export function buildScenePanelAssetDisplayModel(
  assets: SpatialAsset[],
): ScenePanelAssetDisplayModel {
  const layers = assets.filter((asset) => asset.kind === 'layer')
  const foldedRefs = new Set<string>()
  const foldedByParentRef: Record<string, SpatialAsset[]> = {}

  for (const asset of assets) {
    if (asset.kind !== 'entity') continue
    const parentLayer = layers.find((layer) => layerBelongsToEntity(layer, asset))
    if (parentLayer) {
      foldedRefs.add(asset.ref)
      foldedByParentRef[parentLayer.ref] = foldedByParentRef[parentLayer.ref] ?? []
      foldedByParentRef[parentLayer.ref].push(asset)
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
  onRename,
  onVisibilityChange,
  onLockChange,
  onDelete,
  onAddAssetToMap,
  onCreateBuffer,
  onMeasureAsset,
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
}: ScenePanelProps) {
  const [query, setQuery] = useState('')
  const [groupMode, setGroupMode] = useState<ScenePanelGroupMode>('kind')
  const [sortMode, setSortMode] = useState<ScenePanelSortMode>('default')
  const [businessOutcomeFilter, setBusinessOutcomeFilter] =
    useState<ScenePanelBusinessOutcomeFilter>('all')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
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
  const selectedAsset = scene.activeObjectRef ? scene.assets[scene.activeObjectRef] : undefined
  const selectedChildren = selectedAsset
    ? (assetDisplayModel.foldedByParentRef[selectedAsset.ref] ?? [])
    : []
  const visibleAssets = displayAssets.filter((asset) => asset.visible !== false).length
  const layers = displayAssets.filter((asset) => asset.kind === 'layer').length
  const entities = displayAssets.length - layers
  const filteredAssets = useMemo(() => {
    const matchedAssets = query
      ? displayAssets.filter((asset) => matchesAsset(asset, query))
      : [...displayAssets]
    const recentRefs = scene.recentObjectRefs ?? []
    return matchedAssets.sort((a, b) => {
      if (sortMode === 'name') {
        return (a.name || a.id).localeCompare(b.name || b.id, 'zh-CN')
      }
      if (sortMode === 'kind') {
        return (
          assetKindLabel(a).localeCompare(assetKindLabel(b), 'zh-CN') ||
          (a.name || a.id).localeCompare(b.name || b.id, 'zh-CN')
        )
      }
      if (sortMode === 'recent') {
        const rank = (asset: SpatialAsset) => {
          if (asset.ref === scene.activeObjectRef) return -2
          const index = recentRefs.indexOf(asset.ref)
          return index >= 0 ? index : 9999
        }
        return rank(a) - rank(b) || (a.name || a.id).localeCompare(b.name || b.id, 'zh-CN')
      }
      return 0
    })
  }, [displayAssets, query, scene.activeObjectRef, scene.recentObjectRefs, sortMode])
  const groups = filteredAssets.reduce<Record<string, SpatialAsset[]>>((acc, asset) => {
    const label = scenePanelGroupLabel(asset, groupMode)
    acc[label] = acc[label] ?? []
    acc[label].push(asset)
    return acc
  }, {})
  const toggleGroup = (group: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
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
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                  >
                    分组：{groupMode === 'kind' ? '类型' : '来源'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <DropdownMenuLabel>图层树分组</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setGroupMode('kind')}>
                    按类型分组
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setGroupMode('source')}>
                    按来源分组
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                  >
                    排序：
                    {sortMode === 'default'
                      ? '默认'
                      : sortMode === 'name'
                        ? '名称'
                        : sortMode === 'kind'
                          ? '类型'
                          : '最近'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <DropdownMenuLabel>图层顺序</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSortMode('default')}>
                    默认顺序
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSortMode('name')}>按名称</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSortMode('kind')}>按类型</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSortMode('recent')}>
                    最近使用
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-[11px]"
                onClick={() => setCollapsedGroups(new Set(Object.keys(groups)))}
              >
                全部折叠
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setCollapsedGroups(new Set())}
              >
                展开
              </Button>
            </div>
            <div className="hidden rounded-xl border border-primary/20 bg-primary/5 p-2.5">
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
              <div className="hidden rounded-xl border border-border bg-card/70 p-2.5">
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
                              className="h-6 rounded-full border-amber-500/25 bg-amber-500/5 px-2 text-[10px] text-amber-700 dark:text-amber-200"
                              disabled={busy || !asset}
                              onClick={() => {
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
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left hover:bg-muted/60"
                aria-expanded={!collapsedGroups.has(group)}
                onClick={() => toggleGroup(group)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {collapsedGroups.has(group) ? (
                    <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="truncate text-[11px] font-semibold text-muted-foreground">
                    {group}
                  </span>
                </span>
                <span className="rounded-full border border-border px-1.5 py-0 text-[10px] text-muted-foreground">
                  {groupAssets.length}
                </span>
              </button>
              {!collapsedGroups.has(group) &&
                groupAssets.map((asset) => {
                  const visible = asset.visible !== false
                  const selected = scene.activeObjectRef === asset.ref
                  const recent = scene.recentObjectRefs?.includes(asset.ref) ?? false
                  const foldedChildren = assetDisplayModel.foldedByParentRef[asset.ref] ?? []
                  const polygonOverlapRisk = polygonOverlapRiskOverview(asset)
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
                        'group relative cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 py-1 pr-8 transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        selected &&
                          'border-primary/45 bg-primary/10 shadow-[inset_2px_0_0_hsl(var(--primary))]',
                        !visible && 'opacity-60',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 shrink-0"
                          disabled={busy || asset.kind === 'asset'}
                          title={visible ? '隐藏图层' : '显示图层'}
                          aria-label={`${visible ? '隐藏' : '显示'} ${asset.name || asset.id}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void onVisibilityChange(asset, !visible)
                          }}
                        >
                          {visible ? (
                            <Eye className="size-3.5" aria-hidden="true" />
                          ) : (
                            <EyeOff className="size-3.5" aria-hidden="true" />
                          )}
                        </Button>
                        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                          {foldedChildren.length > 0 ? (
                            selected ? (
                              <ChevronDown className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="size-3.5" aria-hidden="true" />
                            )
                          ) : (
                            <span className="size-1 rounded-full bg-border" />
                          )}
                        </span>
                        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                          {assetIcon(asset)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
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
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 shrink-0"
                          disabled={busy}
                          title="定位到图层"
                          aria-label={`定位到 ${asset.name || asset.id}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void onFocus(asset)
                          }}
                        >
                          <Crosshair className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                      {foldedChildren.length > 0 && (
                        <div className="ml-[4.15rem] mt-1 space-y-0.5 border-l border-border/70 pl-2">
                          {foldedChildren.map((child) => (
                            <button
                              key={child.ref}
                              type="button"
                              className="flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[10px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                              title={`${child.ref} · ${child.type}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                void onSelect(asset)
                              }}
                            >
                              <span className="size-1 rounded-full bg-muted-foreground/50" />
                              <span className="truncate">{child.name || child.id}</span>
                              <span className="shrink-0 rounded border border-border px-1 py-0 text-[9px]">
                                {child.type}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="absolute right-1 top-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="size-6 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
                              disabled={busy}
                              aria-label={`${asset.name || asset.id} 更多操作`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MoreHorizontal className="size-3.5" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-44"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <DropdownMenuLabel className="truncate">
                              {asset.name || asset.id}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => void onFocus(asset)}>
                              定位到对象
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void onRename(asset)}>
                              重命名
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => void navigator.clipboard?.writeText(asset.ref)}
                            >
                              复制引用
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => void onLockChange(asset, !asset.locked)}
                            >
                              {asset.locked ? '解锁' : '锁定'}
                            </DropdownMenuItem>
                            {asset.kind !== 'asset' && (
                              <DropdownMenuItem
                                onSelect={() => void onVisibilityChange(asset, !visible)}
                              >
                                {visible ? '隐藏' : '显示'}
                              </DropdownMenuItem>
                            )}
                            {asset.kind === 'asset' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={asset.metadata?.renderTool !== 'addGeoJsonLayer'}
                                  onSelect={() => void onAddAssetToMap(asset)}
                                >
                                  添加到地图
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canCreatePointBuffer(asset)}
                                  onSelect={() => void onCreateBuffer(asset)}
                                >
                                  生成 500m 缓冲区
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!isMeasurableGeoJsonAsset(asset)}
                                  onSelect={() => void onMeasureAsset(asset)}
                                >
                                  量测长度/面积
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!asset.metadata?.renderData}
                                  onSelect={() => void onExportAssetGeoJson(asset)}
                                >
                                  导出 GeoJSON
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!asset.metadata?.renderData}
                                  onSelect={() => void onExportAssetCsv(asset)}
                                >
                                  导出 CSV
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={asset.locked}
                              className="text-destructive focus:text-destructive"
                              onSelect={() => void onDelete(asset)}
                            >
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </article>
                  )
                })}
            </section>
          ))}
          {selectedAsset && (
            <section className="sticky bottom-0 z-10 rounded-xl border border-border bg-card/95 p-3 shadow-[0_-10px_30px_rgb(0_0_0/0.12)] backdrop-blur">
              <div className="mb-2 flex min-w-0 items-start gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {assetIcon(selectedAsset)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                      {selectedAsset.name || selectedAsset.id}
                    </h3>
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[9px]">
                      {assetKindLabel(selectedAsset)}
                    </Badge>
                    {selectedAsset.visible === false && (
                      <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">
                        已隐藏
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                    {selectedAsset.ref}
                  </p>
                </div>
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => void onFocus(selectedAsset)}
                >
                  <Crosshair className="size-3" aria-hidden="true" />
                  定位
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={busy || selectedAsset.kind === 'asset'}
                  onClick={() =>
                    void onVisibilityChange(selectedAsset, selectedAsset.visible === false)
                  }
                >
                  {selectedAsset.visible === false ? (
                    <Eye className="size-3" aria-hidden="true" />
                  ) : (
                    <EyeOff className="size-3" aria-hidden="true" />
                  )}
                  {selectedAsset.visible === false ? '显示' : '隐藏'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => void onRename(selectedAsset)}
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  重命名
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => void onLockChange(selectedAsset, !selectedAsset.locked)}
                >
                  {selectedAsset.locked ? (
                    <Unlock className="size-3" aria-hidden="true" />
                  ) : (
                    <Lock className="size-3" aria-hidden="true" />
                  )}
                  {selectedAsset.locked ? '解锁' : '锁定'}
                </Button>
                {selectedAsset.kind === 'asset' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    disabled={busy || selectedAsset.metadata?.renderTool !== 'addGeoJsonLayer'}
                    onClick={() => void onAddAssetToMap(selectedAsset)}
                  >
                    <Layers className="size-3" aria-hidden="true" />
                    加到地图
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => void navigator.clipboard?.writeText(selectedAsset.ref)}
                >
                  <Copy className="size-3" aria-hidden="true" />
                  复制引用
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                  disabled={busy || selectedAsset.locked}
                  onClick={() => void onDelete(selectedAsset)}
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                  删除
                </Button>
              </div>
              <div className="space-y-1 text-[10px]">
                <DetailRow label="ID" value={selectedAsset.id} mono />
                <DetailRow
                  label="类型"
                  value={`${assetKindLabel(selectedAsset)} / ${selectedAsset.type}`}
                />
                <DetailRow label="来源" value={sourceLabel(selectedAsset)} />
                <DetailRow label="状态" value={assetStatusLabel(selectedAsset)} />
                <DetailRow label="坐标" value={assetPositionLabel(selectedAsset)} mono />
                <DetailRow label="范围" value={assetBboxLabel(selectedAsset)} mono />
                <DetailRow label="数据" value={selectedAsset.uri ?? selectedAsset.dataRefId} mono />
                <DetailRow label="字段" value={assetSchemaLabel(selectedAsset)} mono />
                {selectedChildren.length > 0 && (
                  <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                    <span className="text-muted-foreground">实现项</span>
                    <span className="min-w-0 truncate text-foreground/90">
                      {selectedChildren.map((child) => `${child.type}:${child.id}`).join(' / ')}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
