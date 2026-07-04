import { describe, expect, it } from 'vitest'

import { summarizeTraceEvent } from './SettingsDialog'

describe('summarizeTraceEvent', () => {
  it('summarizes task plan trace events', () => {
    expect(
      summarizeTraceEvent({
        type: 'task.plan.created',
        plan: {
          goal: 'Build a scene',
          steps: [{ id: 's1' }, { id: 's2' }],
        },
      }),
    ).toBe('plan: Build a scene (2 steps)')

    expect(
      summarizeTraceEvent({
        type: 'run.started',
        goal: 'continue',
        continuation: { kind: 'replan', parentRunId: 'run-1', parentStepId: 'step-2' },
      }),
    ).toBe('run continuation: replan run-1/step-2')

    expect(
      summarizeTraceEvent({
        type: 'run.continued',
        goal: 'continue',
        continuation: { kind: 'replan', parentRunId: 'run-1', parentStepId: 'step-2' },
      }),
    ).toBe('run continued: replan run-1/step-2')

    expect(
      summarizeTraceEvent({
        type: 'task.plan.approval_required',
        planId: 'plan-1',
      }),
    ).toBe('plan approval: plan-1')

    expect(
      summarizeTraceEvent({
        type: 'task.step.tool_linked',
        stepId: 'step-1',
        toolCallId: 'tool-1',
      }),
    ).toBe('step tool: step-1 <- tool-1')

    expect(
      summarizeTraceEvent({
        type: 'task.plan.steps_replanned',
        anchorStepId: 'step-1',
        steps: [{ id: 'step-1a' }, { id: 'step-1b' }],
      }),
    ).toBe('plan replanned: step-1 (2 steps)')

    expect(
      summarizeTraceEvent({
        type: 'task.step.retry_requested',
        stepId: 'step-1',
      }),
    ).toBe('step retry: step-1')

    expect(
      summarizeTraceEvent({
        type: 'task.step.skipped',
        stepId: 'step-1',
      }),
    ).toBe('step skipped: step-1')

    expect(
      summarizeTraceEvent({
        type: 'task.step.replan_requested',
        stepId: 'step-1',
      }),
    ).toBe('step replan: step-1')

    expect(
      summarizeTraceEvent({
        type: 'task.step.updated',
        stepId: 'step-1',
        status: 'completed',
        artifactRefs: ['entity:marker-1'],
      }),
    ).toBe('step: step-1 completed, 1 artifacts')
  })
})
