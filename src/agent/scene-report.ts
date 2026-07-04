import type { SceneState, SpatialAsset } from './types'
import { geoJsonToCsv } from './geojson-csv'
import { analysisBusinessSummary, analysisSourceText } from './scene-analysis-summary'

function assetDisplayName(asset: SpatialAsset) {
  return asset.name || asset.id || asset.ref
}

function markdownCell(value: unknown) {
  if (value === undefined || value === null || value === '') return '-'
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function assetBboxText(asset: SpatialAsset) {
  return asset.bbox?.map((value) => value.toFixed(6)).join(', ')
}

function assetFeatureCountText(asset: SpatialAsset) {
  return asset.featureCount === undefined ? undefined : asset.featureCount.toLocaleString('zh-CN')
}

export function buildSceneMarkdownReport(sessionId: string, scene: SceneState, exportedAt: string) {
  const assets = Object.values(scene.assets).sort((left, right) =>
    (left.kind + left.type + assetDisplayName(left)).localeCompare(
      right.kind + right.type + assetDisplayName(right),
      'zh-CN',
    ),
  )
  const visibleCount = assets.filter((asset) => asset.visible !== false).length
  const dataAssets = assets.filter((asset) => asset.kind === 'asset')
  const analysisAssets = dataAssets.filter(
    (asset) => asset.type === 'analysis-result' || asset.metadata?.analysisType,
  )
  const renderableAssets = dataAssets.filter((asset) => asset.metadata?.renderData)
  const csvAssets = renderableAssets.filter((asset) => geoJsonToCsv(asset.metadata?.renderData))
  const lines = [
    '# GaiaAgent 场景分析报告',
    '',
    `- 导出时间：${exportedAt}`,
    `- 会话 ID：${sessionId}`,
    `- 场景版本：${scene.revision}`,
    `- 对象数量：${assets.length}`,
    `- 可见对象：${visibleCount}`,
    `- 数据资产：${dataAssets.length}`,
    `- 分析结果：${analysisAssets.length}`,
    '',
    '## 场景概览',
    '',
  ]

  if (scene.camera) {
    lines.push(
      `- 相机：lon ${scene.camera.lon.toFixed(6)}, lat ${scene.camera.lat.toFixed(6)}, height ${scene.camera.height.toFixed(1)}m`,
    )
  } else {
    lines.push('- 相机：未记录')
  }

  lines.push(
    `- 图层数量：${scene.layers.length}`,
    `- 标注数量：${scene.labels.length}`,
    `- 当前选中：${scene.activeObjectRef ?? '-'}`,
    '',
    '## 资产清单',
    '',
    '| 名称 | 引用 | 类型 | 来源 | 几何 | 要素数 | 范围 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  )

  for (const asset of assets) {
    lines.push(
      `| ${markdownCell(assetDisplayName(asset))} | ${markdownCell(asset.ref)} | ${markdownCell(`${asset.kind}/${asset.type}`)} | ${markdownCell(asset.source)} | ${markdownCell(asset.geometryType)} | ${markdownCell(assetFeatureCountText(asset))} | ${markdownCell(assetBboxText(asset))} |`,
    )
  }

  lines.push('', '## 分析结果', '')
  if (analysisAssets.length === 0) {
    lines.push('- 暂无分析结果资产。')
  } else {
    for (const asset of analysisAssets) {
      lines.push(
        `- ${assetDisplayName(asset)} (${asset.ref})：${asset.metadata?.analysisType ?? asset.type}，来源 ${analysisSourceText(asset)}，要素 ${assetFeatureCountText(asset) ?? '-'}，范围 ${assetBboxText(asset) ?? '-'}`,
      )
      const details = analysisBusinessSummary(asset)
      if (details.length > 0) {
        for (const detail of details) {
          lines.push(`  - ${detail}`)
        }
      }
    }
  }

  lines.push('', '## 可交付成果', '')
  if (renderableAssets.length === 0) {
    lines.push('- 暂无可直接导出的 GeoJSON 资产。')
  } else {
    for (const asset of renderableAssets) {
      lines.push(`- ${assetDisplayName(asset)}：可在资产卡片中导出 GeoJSON（${asset.ref}）`)
    }
  }
  if (csvAssets.length > 0) {
    lines.push('', '### CSV', '')
    for (const asset of csvAssets) {
      lines.push(`- ${assetDisplayName(asset)}：可在资产卡片中导出 CSV（${asset.ref}）`)
    }
  }

  lines.push(
    '',
    '## 备注',
    '',
    '- 本报告由 GaiaAgent 根据当前 SceneState 自动生成。',
    '- 统计数值来自结构化资产元数据；若源数据未提供字段，报告中显示为 `-`。',
    '',
  )

  return lines.join('\n')
}
