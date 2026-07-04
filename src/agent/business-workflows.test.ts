import { describe, expect, it } from 'vitest'
import type { SpatialAsset } from './types'
import {
  buildBusinessWorkflowPrompt,
  buildBusinessWorkflowPromptFromSelectedRefs,
  buildBusinessWorkflowSuggestions,
  businessWorkflowCompatibleAssets,
  businessWorkflowTemplates,
} from './business-workflows'

function asset(
  overrides: Partial<SpatialAsset> & Pick<SpatialAsset, 'ref' | 'id' | 'geometryType'>,
) {
  return {
    kind: 'asset',
    type: 'vector',
    source: 'import',
    metadata: {
      renderData: { type: 'FeatureCollection', features: [] },
    },
    ...overrides,
  } satisfies SpatialAsset
}

describe('business workflow templates', () => {
  it('recommends regional resource coverage when point and polygon assets exist', () => {
    const suggestions = buildBusinessWorkflowSuggestions({
      'asset:hospitals': asset({
        ref: 'asset:hospitals',
        id: 'hospitals',
        name: 'Hospitals',
        geometryType: 'point',
      }),
      'asset:districts': asset({
        ref: 'asset:districts',
        id: 'districts',
        name: 'Districts',
        geometryType: 'polygon',
      }),
    })

    expect(suggestions[0]).toMatchObject({
      readiness: 'ready',
      matchedAssetRefs: ['asset:hospitals', 'asset:districts'],
      missingRoles: [],
    })
    expect(suggestions[0].prompt).toContain('区域资源覆盖评估')
    expect(suggestions[0].prompt).toContain('资源点：Hospitals（asset:hospitals）')
    expect(suggestions[0].prompt).toContain('评估区域：Districts（asset:districts）')
    expect(suggestions[0].prompt).toContain('analysis_spatial_join')
    expect(suggestions[0].prompt).toContain('建议工具：analysis_spatial_join')
  })

  it('marks the workflow partial when only one required asset role is matched', () => {
    const suggestions = buildBusinessWorkflowSuggestions({
      'asset:hospitals': asset({
        ref: 'asset:hospitals',
        id: 'hospitals',
        geometryType: 'point',
      }),
    })

    expect(suggestions[0].readiness).toBe('partial')
    expect(suggestions[0].missingRoles).toEqual(['评估区域'])
    expect(suggestions[0].prompt).toContain('评估区域：尚未匹配')
  })

  it('exposes multiple domain workflow templates', () => {
    expect(businessWorkflowTemplates.map((template) => template.id)).toEqual([
      'regional-resource-coverage',
      'urban-issue-grid-governance',
      'natural-resource-compliance-screening',
    ])
  })

  it('does not reuse the same asset for two required roles', () => {
    const naturalResourceSuggestion = buildBusinessWorkflowSuggestions({
      'asset:project-parcels': asset({
        ref: 'asset:project-parcels',
        id: 'project-parcels',
        name: 'Project parcels',
        geometryType: 'polygon',
      }),
    }).find((suggestion) => suggestion.template.id === 'natural-resource-compliance-screening')

    expect(naturalResourceSuggestion).toMatchObject({
      readiness: 'partial',
      matchedAssetRefs: ['asset:project-parcels'],
      missingRoles: ['管控边界'],
    })
  })

  it('matches two different polygon assets for natural-resource compliance screening', () => {
    const naturalResourceSuggestion = buildBusinessWorkflowSuggestions({
      'asset:project-parcels': asset({
        ref: 'asset:project-parcels',
        id: 'project-parcels',
        name: 'Project parcels',
        geometryType: 'polygon',
      }),
      'asset:redlines': asset({
        ref: 'asset:redlines',
        id: 'redlines',
        name: 'Ecological redlines',
        geometryType: 'polygon',
      }),
    }).find((suggestion) => suggestion.template.id === 'natural-resource-compliance-screening')

    expect(naturalResourceSuggestion).toMatchObject({
      readiness: 'ready',
      matchedAssetRefs: ['asset:project-parcels', 'asset:redlines'],
      missingRoles: [],
    })
    expect(naturalResourceSuggestion?.prompt).toContain('项目地块：Project parcels')
    expect(naturalResourceSuggestion?.prompt).toContain('管控边界：Ecological redlines')
    expect(naturalResourceSuggestion?.prompt).toContain('项目地块和管控边界')
    expect(naturalResourceSuggestion?.prompt).toContain('analysis_polygon_overlap_screen')
    expect(naturalResourceSuggestion?.prompt).toContain('冲突清单表')
    expect(naturalResourceSuggestion?.prompt).toContain('CSV / GeoJSON / Markdown')
    expect(naturalResourceSuggestion?.prompt).toContain('顶点包含/边界相交')
    expect(naturalResourceSuggestion?.prompt).toContain('polygon overlay')
    expect(naturalResourceSuggestion?.prompt).not.toContain('资源点和评估区域')
  })

  it('uses city-governance-specific workflow steps for the city template', () => {
    const citySuggestion = buildBusinessWorkflowSuggestions({
      'asset:issues': asset({
        ref: 'asset:issues',
        id: 'issues',
        name: 'Issue points',
        geometryType: 'point',
      }),
      'asset:grid': asset({
        ref: 'asset:grid',
        id: 'grid',
        name: 'Governance grid',
        geometryType: 'polygon',
      }),
    }).find((suggestion) => suggestion.template.id === 'urban-issue-grid-governance')

    expect(citySuggestion).toMatchObject({
      readiness: 'ready',
      matchedAssetRefs: ['asset:issues', 'asset:grid'],
      missingRoles: [],
    })
    expect(citySuggestion?.prompt).toContain('问题点：Issue points')
    expect(citySuggestion?.prompt).toContain('治理网格：Governance grid')
    expect(citySuggestion?.prompt).toContain('处置优先级建议')
    expect(citySuggestion?.prompt).not.toContain('覆盖与缺口判断')
  })

  it('marks the workflow as needing data when no required asset is available', () => {
    const suggestions = buildBusinessWorkflowSuggestions({})

    expect(suggestions[0]).toMatchObject({
      readiness: 'needs-data',
      matchedAssetRefs: [],
      missingRoles: ['资源点', '评估区域'],
    })
    expect(suggestions[0].prompt).toContain('资源点：尚未匹配')
    expect(suggestions[0].prompt).toContain('评估区域：尚未匹配')
  })

  it('builds a prompt from explicit matched assets', () => {
    const template = businessWorkflowTemplates[0]
    const prompt = buildBusinessWorkflowPrompt(template, {
      资源点: asset({ ref: 'asset:schools', id: 'schools', geometryType: 'point' }),
      评估区域: asset({ ref: 'asset:grid', id: 'grid', geometryType: 'polygon' }),
    })

    expect(prompt).toContain('按“区域资源覆盖评估”业务模板执行一次 GIS 分析。')
    expect(prompt).toContain('报告关注：各区域资源点数量、覆盖薄弱区域')
  })

  it('lists compatible assets and builds a prompt from selected refs', () => {
    const assets = {
      'asset:schools': asset({
        ref: 'asset:schools',
        id: 'schools',
        name: 'Schools',
        geometryType: 'point',
        metadata: { renderData: { type: 'FeatureCollection', features: [] } },
      }),
      'asset:grid': asset({
        ref: 'asset:grid',
        id: 'grid',
        name: 'Grid',
        geometryType: 'polygon',
        metadata: { renderData: { type: 'FeatureCollection', features: [] } },
      }),
      'asset:raw': asset({
        ref: 'asset:raw',
        id: 'raw',
        name: 'Raw no render',
        geometryType: 'point',
        metadata: undefined,
      }),
    }
    const template = businessWorkflowTemplates[0]

    expect(businessWorkflowCompatibleAssets(assets, 'point').map((item) => item.ref)).toEqual([
      'asset:schools',
    ])

    const prompt = buildBusinessWorkflowPromptFromSelectedRefs(template, assets, {
      资源点: 'asset:schools',
      评估区域: 'asset:grid',
    })

    expect(prompt).toContain('资源点：Schools（asset:schools）')
    expect(prompt).toContain('评估区域：Grid（asset:grid）')
    expect(prompt).not.toContain('尚未匹配')
  })
})
