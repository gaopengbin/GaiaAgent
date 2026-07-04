import type { SpatialAsset } from './types'

export type BusinessWorkflowDomain =
  'emergency' | 'city' | 'natural-resource' | 'park' | 'tourism' | 'general'

export interface BusinessWorkflowTemplate {
  id: string
  title: string
  domain: BusinessWorkflowDomain
  description: string
  requiredAssets: Array<{
    role: string
    geometryType: 'point' | 'line' | 'polygon' | 'mixed'
    description: string
  }>
  analysisTools: string[]
  workflowSteps: string[]
  reportFocus: string[]
}

export interface BusinessWorkflowSuggestion {
  template: BusinessWorkflowTemplate
  readiness: 'ready' | 'partial' | 'needs-data'
  prompt: string
  matchedAssetRefs: string[]
  missingRoles: string[]
  matchedAssets: Record<string, SpatialAsset | undefined>
}

export const businessWorkflowTemplates: BusinessWorkflowTemplate[] = [
  {
    id: 'regional-resource-coverage',
    title: '区域资源覆盖评估',
    domain: 'emergency',
    description:
      '评估区域内资源点分布、覆盖范围和缺口，适用于应急、城市管理、园区保障和公共服务分析。',
    requiredAssets: [
      {
        role: '资源点',
        geometryType: 'point',
        description: '医院、消防站、学校、物资点、摄像头或其他需要统计/服务覆盖的点位。',
      },
      {
        role: '评估区域',
        geometryType: 'polygon',
        description: '街道、网格、行政区、园区分区或自定义影响范围。',
      },
    ],
    analysisTools: [
      'analysis_spatial_join',
      'analysis_buffer',
      'analysis_nearest',
      'analysis_filter',
    ],
    workflowSteps: [
      '先检查资源点和评估区域的字段、坐标系、要素数和渲染状态。',
      '如果资源点和评估区域都已具备，优先执行点在面内统计，生成 analysis_spatial_join 结果。',
      '如适合，补充缓冲区、最近邻或属性筛选分析，形成覆盖与缺口判断。',
      '生成可交付摘要，说明关键统计、薄弱区域、数据来源和可导出成果。',
    ],
    reportFocus: [
      '各区域资源点数量',
      '覆盖薄弱区域',
      '最近资源匹配',
      '可交付 GeoJSON / CSV / Markdown 报告',
    ],
  },
  {
    id: 'urban-issue-grid-governance',
    title: '城市问题网格治理统计',
    domain: 'city',
    description: '把问题点位按街道、网格或责任区统计，识别高发区域并形成处置摘要。',
    requiredAssets: [
      {
        role: '问题点',
        geometryType: 'point',
        description: '井盖、积水、违停、投诉、巡检发现或其他城市治理事件点。',
      },
      {
        role: '治理网格',
        geometryType: 'polygon',
        description: '街道、社区、责任网格或执法片区。',
      },
    ],
    analysisTools: ['analysis_spatial_join', 'analysis_filter', 'analysis_measure'],
    workflowSteps: [
      '先检查问题点和治理网格的字段、坐标系、要素数和渲染状态，识别问题类型、时间或状态字段。',
      '如果问题点和治理网格都已具备，执行点在面内统计，生成各网格问题数量。',
      '如字段允许，按问题类型、处置状态或时间范围执行属性筛选，形成高发问题子集。',
      '生成治理摘要，突出高发网格、问题类型分布和处置优先级建议。',
    ],
    reportFocus: ['各网格问题数量', '高发区域', '问题类型筛选', '处置优先级建议'],
  },
  {
    id: 'natural-resource-compliance-screening',
    title: '自然资源合规初筛',
    domain: 'natural-resource',
    description: '对项目地块与管控边界进行初步叠加研判，输出疑似冲突和复核建议。',
    requiredAssets: [
      {
        role: '项目地块',
        geometryType: 'polygon',
        description: '建设项目、用地红线、采矿权、临时用地或其他待核查地块。',
      },
      {
        role: '管控边界',
        geometryType: 'polygon',
        description: '生态红线、永久基本农田、规划控制线、保护区或其他约束边界。',
      },
    ],
    analysisTools: ['analysis_polygon_overlap_screen', 'analysis_measure', 'analysis_filter'],
    workflowSteps: [
      '先检查项目地块和管控边界的字段、坐标系、要素数和渲染状态，确认边界类型字段。',
      '对项目地块和管控边界分别执行量测，生成面积、周长和范围摘要。',
      '如字段允许，按红线类型、保护等级或项目状态执行属性筛选，缩小复核范围。',
      '使用 analysis_polygon_overlap_screen 对项目地块与管控边界执行疑似重叠/压占初筛，并输出候选目标边界索引。',
      '输出合规初筛摘要、冲突清单表和可交付成果包，按高/中/低风险说明优先复核顺序。',
      '明确当前版本是 bbox 预筛 + 顶点包含/边界相交的快速筛查，不等同于精确 polygon overlay，需保留人工复核建议。',
    ],
    reportFocus: [
      '地块面积与范围',
      '疑似压占或邻近风险',
      '高/中/低风险清单',
      'CSV / GeoJSON / Markdown 成果交付',
      '数据来源与人工复核说明',
    ],
  },
]

function assetDisplayName(asset: SpatialAsset) {
  return asset.name || asset.id || asset.ref
}

function isRenderableAsset(asset: SpatialAsset) {
  return asset.kind === 'asset' && !!asset.metadata?.renderData
}

function geometryMatches(asset: SpatialAsset, geometryType: string) {
  return (
    asset.geometryType === geometryType ||
    asset.geometryType === 'mixed' ||
    asset.geometryType === undefined
  )
}

function firstAssetByGeometry(
  assets: SpatialAsset[],
  geometryType: 'point' | 'line' | 'polygon' | 'mixed',
  usedRefs: Set<string>,
) {
  return assets.find(
    (asset) =>
      !usedRefs.has(asset.ref) && isRenderableAsset(asset) && geometryMatches(asset, geometryType),
  )
}

export function businessWorkflowCompatibleAssets(
  assetsByRef: Record<string, SpatialAsset>,
  geometryType: 'point' | 'line' | 'polygon' | 'mixed',
) {
  return Object.values(assetsByRef)
    .filter((asset) => isRenderableAsset(asset) && geometryMatches(asset, geometryType))
    .sort((left, right) => assetDisplayName(left).localeCompare(assetDisplayName(right), 'zh-CN'))
}

export function buildBusinessWorkflowPrompt(
  template: BusinessWorkflowTemplate,
  matchedAssets: Record<string, SpatialAsset | undefined>,
) {
  const assetLines = template.requiredAssets.map((requirement) => {
    const asset = matchedAssets[requirement.role]
    return asset
      ? `- ${requirement.role}：${assetDisplayName(asset)}（${asset.ref}）`
      : `- ${requirement.role}：尚未匹配，请先让我导入或选择 ${requirement.description}`
  })
  return [
    `按“${template.title}”业务模板执行一次 GIS 分析。`,
    '',
    '已匹配资产：',
    ...assetLines,
    '',
    '请按以下流程推进：',
    ...template.workflowSteps.map((step, index) => `${index + 1}. ${step}`),
    '',
    `建议工具：${template.analysisTools.join('、')}。`,
    `报告关注：${template.reportFocus.join('、')}。`,
  ].join('\n')
}

export function buildBusinessWorkflowPromptFromSelectedRefs(
  template: BusinessWorkflowTemplate,
  assetsByRef: Record<string, SpatialAsset>,
  selectedAssetRefs: Record<string, string | undefined>,
) {
  const matchedAssets = Object.fromEntries(
    template.requiredAssets.map((requirement) => [
      requirement.role,
      selectedAssetRefs[requirement.role]
        ? assetsByRef[selectedAssetRefs[requirement.role] as string]
        : undefined,
    ]),
  ) as Record<string, SpatialAsset | undefined>
  return buildBusinessWorkflowPrompt(template, matchedAssets)
}

export function buildBusinessWorkflowSuggestions(
  assetsByRef: Record<string, SpatialAsset>,
): BusinessWorkflowSuggestion[] {
  const assets = Object.values(assetsByRef)
  return businessWorkflowTemplates.map((template) => {
    const matchedAssets: Record<string, SpatialAsset | undefined> = {}
    const missingRoles: string[] = []
    const usedRefs = new Set<string>()
    for (const requirement of template.requiredAssets) {
      const asset = firstAssetByGeometry(assets, requirement.geometryType, usedRefs)
      matchedAssets[requirement.role] = asset
      if (asset) usedRefs.add(asset.ref)
      if (!asset) missingRoles.push(requirement.role)
    }
    const matchedAssetRefs = Object.values(matchedAssets)
      .filter((asset): asset is SpatialAsset => !!asset)
      .map((asset) => asset.ref)
    const readiness =
      missingRoles.length === 0 ? 'ready' : matchedAssetRefs.length > 0 ? 'partial' : 'needs-data'
    return {
      template,
      readiness,
      prompt: buildBusinessWorkflowPrompt(template, matchedAssets),
      matchedAssetRefs,
      missingRoles,
      matchedAssets,
    }
  })
}
