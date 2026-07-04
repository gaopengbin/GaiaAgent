import { describe, expect, it } from 'vitest'
import type { AgentRunView, SpatialAsset } from '../agent'
import {
  buildBusinessWorkflowEntryCards,
  buildSceneArtifactChipModel,
  businessWorkflowCompletionSummary,
  businessWorkflowRunProgress,
  businessWorkflowRunContextFromGoal,
} from './ChatPanel'
import { buildBusinessWorkflowSuggestions } from '../agent/business-workflows'

function asset(overrides: Partial<SpatialAsset> = {}) {
  return {
    ref: 'entity:marker-1',
    id: 'marker-1',
    kind: 'entity',
    type: 'marker',
    name: '冒烟测试点',
    visible: true,
    source: 'agent',
    ...overrides,
  } satisfies SpatialAsset
}

describe('buildSceneArtifactChipModel', () => {
  it('describes available scene artifacts with type source and visibility', () => {
    expect(buildSceneArtifactChipModel(asset(), 'entity:marker-1')).toMatchObject({
      label: '冒烟测试点',
      detail: '标注 · AI · 可见',
      available: true,
      hidden: false,
      locked: false,
    })
  })

  it('includes hidden and locked state in the artifact chip model', () => {
    expect(
      buildSceneArtifactChipModel(
        asset({
          visible: false,
          locked: true,
          source: 'import',
        }),
        'entity:marker-1',
      ),
    ).toMatchObject({
      detail: '标注 · 导入 · 隐藏 · 锁定',
      available: true,
      hidden: true,
      locked: true,
    })
  })

  it('keeps missing artifacts disabled until scene state catches up', () => {
    expect(buildSceneArtifactChipModel(undefined, 'layer:future-layer')).toMatchObject({
      label: 'layer:future-layer',
      detail: '尚未同步',
      available: false,
    })
  })
})

describe('buildBusinessWorkflowEntryCards', () => {
  it('turns workflow suggestions into visible task entry cards', () => {
    const suggestions = buildBusinessWorkflowSuggestions({
      'asset:hospitals': asset({
        ref: 'asset:hospitals',
        id: 'hospitals',
        kind: 'asset',
        type: 'tabular',
        name: 'Hospitals',
        geometryType: 'point',
        metadata: { renderData: { type: 'FeatureCollection', features: [] } },
      }),
      'asset:districts': asset({
        ref: 'asset:districts',
        id: 'districts',
        kind: 'asset',
        type: 'vector',
        name: 'Districts',
        geometryType: 'polygon',
        metadata: { renderData: { type: 'FeatureCollection', features: [] } },
      }),
    })

    const cards = buildBusinessWorkflowEntryCards(suggestions)

    expect(cards[0]).toMatchObject({
      id: 'regional-resource-coverage',
      title: '区域资源覆盖评估',
      readiness: 'ready',
      readinessLabel: '已匹配数据',
      matchedAssetCount: 2,
      missingText: '数据已匹配',
    })
    expect(cards[0].prompt).toContain('按“区域资源覆盖评估”业务模板执行一次 GIS 分析。')
    expect(cards[0].toolText).toContain('analysis_spatial_join')
    expect(cards[0].previewStepText).toContain('先检查资源点和评估区域')
    expect(cards[0].previewStepText).toContain('analysis_spatial_join')
    expect(cards[0].expectedDeliverableText).toContain('可交付 GeoJSON / CSV / Markdown 报告')
    expect(cards[0].reportFocusText).toContain('各区域资源点数量')
  })

  it('shows missing roles for partially matched workflow entries', () => {
    const cards = buildBusinessWorkflowEntryCards(
      buildBusinessWorkflowSuggestions({
        'asset:hospitals': asset({
          ref: 'asset:hospitals',
          id: 'hospitals',
          kind: 'asset',
          type: 'tabular',
          name: 'Hospitals',
          geometryType: 'point',
          metadata: { renderData: { type: 'FeatureCollection', features: [] } },
        }),
      }),
    )

    expect(cards[0]).toMatchObject({
      readiness: 'partial',
      readinessLabel: '需补数据',
      matchedAssetCount: 1,
      missingText: '缺少：评估区域',
    })
  })
})

describe('businessWorkflowRunContextFromGoal', () => {
  it('detects the workflow template context from a template prompt', () => {
    expect(
      businessWorkflowRunContextFromGoal(
        '按“自然资源合规初筛”业务模板执行一次 GIS 分析。\n\n已匹配资产：',
      ),
    ).toMatchObject({
      id: 'natural-resource-compliance-screening',
      title: '自然资源合规初筛',
      toolText: expect.stringContaining('analysis_polygon_overlap_screen'),
      expectedDeliverableText: expect.stringContaining('高/中/低风险清单'),
    })
  })

  it('does not label ordinary prompts as workflow runs', () => {
    expect(businessWorkflowRunContextFromGoal('飞到故宫')).toBeNull()
  })

  it('maps task plan completion to workflow template progress', () => {
    const run = {
      id: 'run-1',
      goal: '按“自然资源合规初筛”业务模板执行一次 GIS 分析。',
      status: 'running',
      startedAt: 1,
      messages: [],
      tools: [],
      scenePatches: [],
      plan: {
        id: 'plan-1',
        goal: '自然资源合规初筛',
        status: 'running',
        steps: [
          { id: 'step-1', title: '检查数据', status: 'completed' },
          { id: 'step-2', title: '量测面积', status: 'completed' },
          { id: 'step-3', title: '冲突初筛', status: 'running' },
          { id: 'step-4', title: '生成报告', status: 'planned' },
        ],
      },
    } satisfies AgentRunView

    expect(businessWorkflowRunProgress(run)).toMatchObject({
      id: 'natural-resource-compliance-screening',
      completedPlanSteps: 2,
      totalPlanSteps: 4,
      completedTemplateSteps: 3,
      totalTemplateSteps: 6,
      currentTemplateStepIndex: 3,
      currentTemplateStep: expect.stringContaining('使用 analysis_polygon_overlap_screen'),
    })
  })
})

describe('businessWorkflowCompletionSummary', () => {
  it('summarizes artifacts, analysis results, and review status for completed workflow runs', () => {
    const run = {
      id: 'run-1',
      goal: '按“自然资源合规初筛”业务模板执行一次 GIS 分析。',
      status: 'completed',
      startedAt: 1,
      messages: [],
      tools: [],
      scenePatches: [],
      plan: {
        id: 'plan-1',
        goal: '自然资源合规初筛',
        status: 'completed',
        steps: [
          {
            id: 'step-1',
            title: '冲突初筛',
            status: 'completed',
            artifactRefs: ['asset:overlap', 'asset:missing'],
          },
        ],
      },
    } satisfies AgentRunView
    const sceneAssets = {
      'asset:overlap': asset({
        ref: 'asset:overlap',
        id: 'overlap',
        name: 'Overlap screen',
        kind: 'asset',
        type: 'analysis-result',
        geometryType: 'polygon',
        metadata: {
          analysisType: 'polygon_overlap_screen',
          renderData: {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', properties: { reviewStatus: 'pending' }, geometry: null },
              { type: 'Feature', properties: { reviewStatus: 'confirmed' }, geometry: null },
            ],
          },
        },
      }),
    }

    expect(businessWorkflowCompletionSummary(run, sceneAssets)).toMatchObject({
      title: '自然资源合规初筛',
      artifactCount: 2,
      availableArtifactCount: 1,
      analysisResultCount: 1,
      pendingReviewCount: 1,
      completedReviewCount: 1,
      artifactLabels: ['Overlap screen'],
      artifacts: [
        {
          ref: 'asset:overlap',
          label: 'Overlap screen',
          analysisResult: true,
        },
      ],
      continueReviewPrompt: expect.stringContaining('待复核事项'),
    })
  })

  it('does not summarize unfinished workflow runs', () => {
    expect(
      businessWorkflowCompletionSummary(
        {
          id: 'run-1',
          goal: '按“自然资源合规初筛”业务模板执行一次 GIS 分析。',
          status: 'running',
          startedAt: 1,
          messages: [],
          tools: [],
          scenePatches: [],
        } satisfies AgentRunView,
        {},
      ),
    ).toBeNull()
  })
})
