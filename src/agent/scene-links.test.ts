import { describe, expect, it } from 'vitest'
import type { AgentTimelineState } from './event-reducer'
import { buildSceneObjectTaskLinks } from './scene-links'

describe('buildSceneObjectTaskLinks', () => {
  it('links scene object refs back to their producing task step', () => {
    const timeline = {
      runOrder: ['run-1'],
      runs: {
        'run-1': {
          id: 'run-1',
          goal: '创建故宫标注',
          status: 'completed',
          startedAt: 1,
          messages: [],
          tools: [],
          scenePatches: [],
          plan: {
            id: 'plan-1',
            goal: '创建故宫标注',
            status: 'completed',
            steps: [
              {
                id: 'step-1',
                title: '添加红色标注',
                status: 'completed',
                toolCallId: 'tool-1',
                toolCallIds: ['tool-1', 'tool-1-retry'],
                artifactRefs: ['entity:marker-1'],
              },
            ],
          },
        },
      },
    } satisfies AgentTimelineState

    expect(buildSceneObjectTaskLinks(timeline)).toEqual({
      'entity:marker-1': {
        ref: 'entity:marker-1',
        runId: 'run-1',
        runGoal: '创建故宫标注',
        stepId: 'step-1',
        stepTitle: '添加红色标注',
        stepIndex: 0,
        toolCallIds: ['tool-1', 'tool-1-retry'],
      },
    })
  })

  it('keeps the first producing step when a ref appears multiple times', () => {
    const timeline = {
      runOrder: ['run-1'],
      runs: {
        'run-1': {
          id: 'run-1',
          goal: '第一次创建',
          status: 'completed',
          startedAt: 1,
          messages: [],
          tools: [],
          scenePatches: [],
          plan: {
            id: 'plan-1',
            goal: '第一次创建',
            status: 'completed',
            steps: [
              {
                id: 'step-1',
                title: '创建对象',
                status: 'completed',
                artifactRefs: ['entity:marker-1'],
              },
              {
                id: 'step-2',
                title: '更新对象',
                status: 'completed',
                artifactRefs: ['entity:marker-1'],
              },
            ],
          },
        },
      },
    } satisfies AgentTimelineState

    expect(buildSceneObjectTaskLinks(timeline)['entity:marker-1']?.stepId).toBe('step-1')
  })
})
