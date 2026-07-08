import { describe, expect, it } from 'vitest'

import {
  agentTimelineReducer,
  initialAgentTimelineState,
  normalizeAgentTimelineState,
} from './event-reducer'
import { createAgentEvent } from './events'

describe('agentTimelineReducer', () => {
  it('builds a complete run from an event stream', () => {
    const runId = 'run-1'
    const callId = 'run-1:tool:1'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: '定位黄山' }),
      createAgentEvent(runId, { type: 'reasoning.delta', text: '先解析地点', round: 1 }),
      createAgentEvent(runId, {
        type: 'tool.requested',
        call: {
          id: callId,
          name: 'geocode',
          arguments: { address: '黄山' },
          round: 1,
          risk: 'network',
        },
      }),
      createAgentEvent(runId, { type: 'tool.started', callId }),
      createAgentEvent(runId, {
        type: 'tool.completed',
        callId,
        result: { data: { longitude: 118.17, latitude: 30.13 } },
      }),
      createAgentEvent(runId, {
        type: 'message.delta',
        messageId: 'answer',
        text: '已定位',
      }),
      createAgentEvent(runId, {
        type: 'message.completed',
        messageId: 'answer',
        text: '已定位黄山。',
      }),
      createAgentEvent(runId, {
        type: 'usage.updated',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
      createAgentEvent(runId, { type: 'run.completed', summary: '1 个工具成功' }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.status).toBe('completed')
    expect(run.reasoning).toMatchObject({ text: '先解析地点', status: 'done', round: 1 })
    expect(run.tools[0]).toMatchObject({ status: 'completed', call: { name: 'geocode' } })
    expect(run.plan).toMatchObject({
      goal: '定位黄山',
      status: 'completed',
      steps: [{ id: callId, title: 'geocode', status: 'completed', risk: 'network' }],
    })
    expect(run.messages[0]).toEqual({ id: 'answer', text: '已定位黄山。', streaming: false })
    expect(run.usage?.totalTokens).toBe(15)
  })

  it('tracks approval, failure and cancellation without losing prior state', () => {
    const runId = 'run-2'
    const callId = 'run-2:tool:1'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: '执行外部程序' }),
      createAgentEvent(runId, {
        type: 'tool.requested',
        call: { id: callId, name: 'run', arguments: {}, risk: 'process' },
      }),
      createAgentEvent(runId, {
        type: 'tool.approval_required',
        callId,
        risk: 'process',
        reason: '将启动本地进程',
      }),
      createAgentEvent(runId, {
        type: 'tool.failed',
        callId,
        error: { code: 'denied', message: '用户拒绝', category: 'tool' },
      }),
      createAgentEvent(runId, { type: 'run.cancelled', reason: '已停止' }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.status).toBe('cancelled')
    expect(run.summary).toBe('已停止')
    expect(run.plan).toMatchObject({
      status: 'cancelled',
      steps: [{ id: callId, status: 'failed', risk: 'process' }],
    })
    expect(run.tools[0]).toMatchObject({
      status: 'failed',
      risk: 'process',
      approvalReason: '将启动本地进程',
      error: { code: 'denied' },
    })
  })

  it('stops visible streaming state when a run fails', () => {
    const runId = 'run-token-budget'
    const state = [
      createAgentEvent(runId, { type: 'run.started', goal: '截图' }),
      createAgentEvent(runId, { type: 'reasoning.status', status: 'streaming' }),
      createAgentEvent(runId, {
        type: 'message.delta',
        messageId: 'answer',
        text: '截图成功',
      }),
      createAgentEvent(runId, {
        type: 'run.failed',
        error: {
          code: 'native_runtime_failed',
          message: 'Agent run stopped because the token budget was exceeded.',
          category: 'internal',
        },
      }),
    ].reduce(agentTimelineReducer, initialAgentTimelineState)

    const run = state.runs[runId]
    expect(run.status).toBe('failed')
    expect(run.reasoning?.status).toBe('done')
    expect(run.messages[0]).toMatchObject({ text: '截图成功', streaming: false })
  })

  it('prefers explicit task plans and syncs later tool status into matching steps', () => {
    const runId = 'run-plan'
    const callId = 'call-geocode'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: '规划一条路线' }),
      createAgentEvent(runId, {
        type: 'task.plan.created',
        plan: {
          id: 'plan-1',
          goal: '规划一条路线',
          steps: [
            {
              id: 'step-1',
              title: '查询起点坐标',
              status: 'planned',
              toolCallId: callId,
              risk: 'network',
            },
          ],
        },
      }),
      createAgentEvent(runId, {
        type: 'tool.requested',
        call: { id: callId, name: 'geocode', arguments: {}, risk: 'network' },
      }),
      createAgentEvent(runId, {
        type: 'task.step.tool_linked',
        stepId: 'step-1',
        toolCallId: callId,
        title: 'geocode',
        risk: 'network',
      }),
      createAgentEvent(runId, {
        type: 'task.step.updated',
        stepId: callId,
        status: 'running',
      }),
      createAgentEvent(runId, {
        type: 'task.step.updated',
        stepId: callId,
        status: 'completed',
        artifactRefs: ['entity:marker-1'],
      }),
      createAgentEvent(runId, {
        type: 'tool.completed',
        callId,
        result: { output: JSON.stringify({ entityId: 'marker-2' }) },
      }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.plan).toMatchObject({
      id: 'plan-1',
      status: 'completed',
      steps: [
        {
          id: 'step-1',
          title: '查询起点坐标',
          status: 'completed',
          toolCallId: callId,
          toolCallIds: [callId],
          risk: 'network',
          artifactRefs: ['entity:marker-1', 'entity:marker-2'],
          result: { output: JSON.stringify({ entityId: 'marker-2' }) },
        },
      ],
    })
  })

  it('marks an explicit task plan as awaiting approval before tools exist', () => {
    const runId = 'run-plan-approval'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: '生成旅游展示' }),
      createAgentEvent(runId, {
        type: 'task.plan.created',
        plan: {
          id: 'plan-approval',
          goal: '生成旅游展示',
          steps: [
            { id: 'step-1', title: '梳理路线', status: 'planned' },
            { id: 'step-2', title: '创建地图对象', status: 'planned' },
          ],
        },
      }),
      createAgentEvent(runId, {
        type: 'task.plan.approval_required',
        planId: 'plan-approval',
      }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.tools).toHaveLength(0)
    expect(run.plan).toMatchObject({
      id: 'plan-approval',
      status: 'awaiting-approval',
      steps: [
        { id: 'step-1', status: 'planned' },
        { id: 'step-2', status: 'planned' },
      ],
    })
  })

  it('adds a visible fallback when a completed run only has reasoning', () => {
    const runId = 'run-reasoning-only'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: '现在呢' }),
      createAgentEvent(runId, {
        type: 'reasoning.delta',
        text: "The user is testing whether I'll follow injected rules.",
      }),
      createAgentEvent(runId, { type: 'run.completed' }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.status).toBe('completed')
    expect(run.reasoning).toMatchObject({ status: 'done' })
    expect(run.messages).toHaveLength(1)
    expect(run.messages[0].text).toContain('没有返回可见正文')
    expect(run.messages[0].streaming).toBe(false)
  })

  it('normalizes persisted timelines without losing task plan details', () => {
    const state = normalizeAgentTimelineState({
      runOrder: ['run-persisted', 'missing-run'],
      runs: {
        'run-persisted': {
          id: 'run-persisted',
          goal: 'build scene',
          status: 'completed',
          startedAt: 123,
          messages: [{ id: 'm1', text: 'done', streaming: false }],
          tools: [
            {
              call: { id: 'tool-1', name: 'add_marker', arguments: { name: 'Palace' } },
              status: 'completed',
              result: { output: JSON.stringify({ entityId: 'marker-1' }) },
            },
          ],
          plan: {
            id: 'plan-1',
            goal: 'build scene',
            status: 'completed',
            steps: [
              {
                id: 'step-1',
                title: 'Add marker',
                status: 'completed',
                toolCallIds: ['tool-1'],
                artifactRefs: ['entity:marker-0'],
              },
            ],
          },
          scenePatches: [{}],
        },
      },
      lastEventId: 'event-9',
    })

    expect(state.runOrder).toEqual(['run-persisted'])
    expect(state.lastEventId).toBe('event-9')
    expect(state.runs['run-persisted'].plan).toMatchObject({
      id: 'plan-1',
      steps: [
        {
          id: 'step-1',
          toolCallIds: ['tool-1'],
          artifactRefs: ['entity:marker-0', 'entity:marker-1'],
          result: { output: JSON.stringify({ entityId: 'marker-1' }) },
        },
      ],
    })
  })

  it('ignores events for unknown runs', () => {
    const event = createAgentEvent('missing', {
      type: 'message.completed',
      messageId: 'message',
      text: 'ignored',
    })

    const state = agentTimelineReducer(initialAgentTimelineState, event)
    expect(state.runOrder).toEqual([])
    expect(state.lastEventId).toBe(event.id)
  })

  it('marks a failed task step as retrying when retry is requested', () => {
    const runId = 'run-step-retry'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: 'retry failed step' }),
      createAgentEvent(runId, {
        type: 'task.plan.created',
        plan: {
          id: 'plan-retry',
          goal: 'retry failed step',
          steps: [{ id: 'step-1', title: 'Add marker', status: 'planned' }],
        },
      }),
      createAgentEvent(runId, {
        type: 'task.step.updated',
        stepId: 'step-1',
        status: 'failed',
        error: { code: 'boom', message: 'failed once', category: 'tool' },
      }),
      createAgentEvent(runId, {
        type: 'task.step.retry_requested',
        stepId: 'step-1',
        reason: 'try again',
      }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.plan).toMatchObject({
      id: 'plan-retry',
      status: 'running',
      steps: [
        {
          id: 'step-1',
          status: 'retrying',
          error: { code: 'task_step_retry_requested', message: 'try again' },
        },
      ],
    })
  })

  it('uses the latest linked tool call when a retried step completes', () => {
    const runId = 'run-step-retry-complete'
    const originalCallId = 'tool-original'
    const retryCallId = 'tool-original:retry:1'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: 'retry failed step' }),
      createAgentEvent(runId, {
        type: 'task.plan.created',
        plan: {
          id: 'plan-retry-complete',
          goal: 'retry failed step',
          steps: [
            {
              id: 'step-1',
              title: 'Add marker',
              status: 'planned',
              toolCallId: originalCallId,
              toolCallIds: [originalCallId],
            },
          ],
        },
      }),
      createAgentEvent(runId, {
        type: 'tool.requested',
        call: { id: originalCallId, name: 'scene_add_marker', arguments: {} },
      }),
      createAgentEvent(runId, {
        type: 'tool.failed',
        callId: originalCallId,
        error: { code: 'boom', message: 'failed once', category: 'tool' },
      }),
      createAgentEvent(runId, {
        type: 'task.step.retry_requested',
        stepId: 'step-1',
        reason: 'try again',
      }),
      createAgentEvent(runId, {
        type: 'task.step.tool_linked',
        stepId: 'step-1',
        toolCallId: retryCallId,
      }),
      createAgentEvent(runId, {
        type: 'tool.requested',
        call: { id: retryCallId, name: 'scene_add_marker', arguments: {} },
      }),
      createAgentEvent(runId, { type: 'tool.started', callId: retryCallId }),
      createAgentEvent(runId, {
        type: 'tool.completed',
        callId: retryCallId,
        result: { output: JSON.stringify({ entityId: 'marker-1' }) },
      }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.status).toBe('running')
    expect(run.plan).toMatchObject({
      id: 'plan-retry-complete',
      status: 'completed',
      steps: [
        {
          id: 'step-1',
          status: 'completed',
          toolCallId: originalCallId,
          toolCallIds: [originalCallId, retryCallId],
          artifactRefs: ['entity:marker-1'],
          result: { output: JSON.stringify({ entityId: 'marker-1' }) },
        },
      ],
    })
  })

  it('marks skipped task steps as terminal for plan completion', () => {
    const runId = 'run-step-skip'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: 'skip failed step' }),
      createAgentEvent(runId, {
        type: 'task.plan.created',
        plan: {
          id: 'plan-skip',
          goal: 'skip failed step',
          steps: [
            { id: 'step-1', title: 'Add marker', status: 'completed' },
            { id: 'step-2', title: 'Add layer', status: 'failed' },
          ],
        },
      }),
      createAgentEvent(runId, {
        type: 'task.step.skipped',
        stepId: 'step-2',
        reason: 'not needed',
      }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.plan).toMatchObject({
      id: 'plan-skip',
      status: 'completed',
      steps: [
        { id: 'step-1', status: 'completed' },
        {
          id: 'step-2',
          status: 'skipped',
          error: { code: 'task_step_skipped', message: 'not needed' },
        },
      ],
    })
  })

  it('marks task steps that need model replanning', () => {
    const runId = 'run-step-replan'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: 'continue task' }),
      createAgentEvent(runId, {
        type: 'task.plan.created',
        plan: {
          id: 'plan-replan',
          goal: 'continue task',
          steps: [{ id: 'step-1', title: 'Plan next action', status: 'planned' }],
        },
      }),
      createAgentEvent(runId, {
        type: 'task.step.updated',
        stepId: 'step-1',
        status: 'needs-planning',
        error: {
          code: 'task_step_needs_planning',
          message: 'needs model planning',
          category: 'tool',
        },
      }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.plan).toMatchObject({
      id: 'plan-replan',
      status: 'running',
      steps: [
        {
          id: 'step-1',
          status: 'needs-planning',
          error: { code: 'task_step_needs_planning' },
        },
      ],
    })
  })

  it('moves a needs-planning task step back to planned when replanning is requested', () => {
    const runId = 'run-step-replan-requested'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: 'continue task' }),
      createAgentEvent(runId, {
        type: 'task.plan.created',
        plan: {
          id: 'plan-replan-requested',
          goal: 'continue task',
          steps: [{ id: 'step-1', title: 'Plan next action', status: 'needs-planning' }],
        },
      }),
      createAgentEvent(runId, {
        type: 'task.step.replan_requested',
        stepId: 'step-1',
        reason: 'try a different path',
      }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.status).toBe('running')
    expect(run.plan).toMatchObject({
      id: 'plan-replan-requested',
      status: 'running',
      steps: [
        {
          id: 'step-1',
          status: 'planned',
          error: { code: 'task_step_replan_requested', message: 'try a different path' },
        },
      ],
    })
  })

  it('replaces the unfinished plan tail when replanned steps arrive', () => {
    const runId = 'run-step-tail-replanned'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: 'replan tail' }),
      createAgentEvent(runId, {
        type: 'task.plan.created',
        plan: {
          id: 'plan-tail',
          goal: 'replan tail',
          steps: [
            { id: 'step-1', title: 'Completed setup', status: 'completed' },
            { id: 'step-2', title: 'Needs replanning', status: 'needs-planning' },
            { id: 'step-3', title: 'Old tail', status: 'planned' },
          ],
        },
      }),
      createAgentEvent(runId, {
        type: 'task.plan.steps_replanned',
        anchorStepId: 'step-2',
        reason: 'new path',
        steps: [
          { id: 'step-2a', title: 'New step A', status: 'planned' },
          { id: 'step-2b', title: 'New step B', status: 'planned' },
        ],
      }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(run.plan).toMatchObject({
      id: 'plan-tail',
      status: 'running',
      steps: [
        { id: 'step-1', status: 'completed' },
        {
          id: 'step-2a',
          title: 'New step A',
          status: 'planned',
          error: { code: 'task_step_replanned', message: 'new path' },
        },
        {
          id: 'step-2b',
          title: 'New step B',
          status: 'planned',
          error: { code: 'task_step_replanned', message: 'new path' },
        },
      ],
    })
  })

  it('records and restores replan continuation metadata on child runs', () => {
    const state = [
      createAgentEvent('run-parent', { type: 'run.started', goal: 'original task' }),
      createAgentEvent('run-child', {
        type: 'run.started',
        goal: 'continue replanned task',
        continuation: {
          kind: 'replan',
          parentRunId: 'run-parent',
          parentStepId: 'step-2',
          reason: 'new path',
        },
      }),
    ].reduce(agentTimelineReducer, initialAgentTimelineState)

    expect(state.runs['run-child'].continuation).toEqual({
      kind: 'replan',
      parentRunId: 'run-parent',
      parentStepId: 'step-2',
      reason: 'new path',
    })

    const restored = normalizeAgentTimelineState(JSON.parse(JSON.stringify(state)))
    expect(restored.runs['run-child'].continuation).toEqual(state.runs['run-child'].continuation)
  })

  it('keeps an auditable in-run chain for replanned task continuations', () => {
    const runId = 'run-replan-inline'
    const callId = 'call-add-fallback-route'
    const events = [
      createAgentEvent(runId, { type: 'run.started', goal: 'build route scene' }),
      createAgentEvent(runId, {
        type: 'task.plan.created',
        plan: {
          id: 'plan-inline',
          goal: 'build route scene',
          steps: [
            { id: 'step-1', title: 'Add start marker', status: 'completed' },
            { id: 'step-2', title: 'Draw unavailable route', status: 'needs-planning' },
            { id: 'step-3', title: 'Focus old route', status: 'planned' },
          ],
        },
      }),
      createAgentEvent(runId, {
        type: 'task.step.replan_requested',
        stepId: 'step-2',
        reason: 'route source is unavailable',
      }),
      createAgentEvent(runId, {
        type: 'task.plan.steps_replanned',
        anchorStepId: 'step-2',
        reason: 'route source is unavailable',
        steps: [
          { id: 'step-2a', title: 'Create fallback route', status: 'planned' },
          { id: 'step-2b', title: 'Focus fallback route', status: 'planned' },
        ],
      }),
      createAgentEvent(runId, {
        type: 'run.continued',
        goal: 'continue replanned route task',
        continuation: {
          kind: 'replan',
          parentRunId: runId,
          parentStepId: 'step-2',
          reason: 'route source is unavailable',
        },
      }),
      createAgentEvent(runId, {
        type: 'task.step.tool_linked',
        stepId: 'step-2a',
        toolCallId: callId,
        title: 'scene_add_polyline',
        risk: 'scene-write',
      }),
      createAgentEvent(runId, {
        type: 'tool.requested',
        call: {
          id: callId,
          name: 'scene_add_polyline',
          arguments: { name: 'Fallback route' },
          risk: 'scene-write',
        },
      }),
      createAgentEvent(runId, { type: 'tool.started', callId }),
      createAgentEvent(runId, {
        type: 'tool.completed',
        callId,
        result: { output: JSON.stringify({ entityId: 'route-fallback' }) },
      }),
      createAgentEvent(runId, {
        type: 'task.step.updated',
        stepId: 'step-2b',
        status: 'completed',
        artifactRefs: ['entity:route-fallback'],
      }),
      createAgentEvent(runId, { type: 'run.completed', summary: 'fallback route created' }),
    ]

    const state = events.reduce(agentTimelineReducer, initialAgentTimelineState)
    const run = state.runs[runId]

    expect(state.runOrder).toEqual([runId])
    expect(run.continuation).toEqual({
      kind: 'replan',
      parentRunId: runId,
      parentStepId: 'step-2',
      reason: 'route source is unavailable',
    })
    expect(run.continuations).toEqual([run.continuation])
    expect(run.status).toBe('completed')
    expect(run.plan).toMatchObject({
      id: 'plan-inline',
      status: 'completed',
      steps: [
        { id: 'step-1', title: 'Add start marker', status: 'completed' },
        {
          id: 'step-2a',
          title: 'Create fallback route',
          status: 'completed',
          toolCallId: callId,
          toolCallIds: [callId],
          artifactRefs: ['entity:route-fallback'],
          error: {
            code: 'task_step_replanned',
            message: 'route source is unavailable',
          },
        },
        {
          id: 'step-2b',
          title: 'Focus fallback route',
          status: 'completed',
          artifactRefs: ['entity:route-fallback'],
          error: {
            code: 'task_step_replanned',
            message: 'route source is unavailable',
          },
        },
      ],
    })
  })
})
