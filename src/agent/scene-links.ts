import type { AgentTimelineState } from './event-reducer'

export interface SceneObjectTaskLink {
  ref: string
  runId: string
  runGoal: string
  stepId: string
  stepTitle: string
  stepIndex: number
  toolCallIds: string[]
}

function mergeUniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => !!value)))
}

export function buildSceneObjectTaskLinks(
  timeline: AgentTimelineState,
): Record<string, SceneObjectTaskLink> {
  const links: Record<string, SceneObjectTaskLink> = {}

  for (const runId of timeline.runOrder) {
    const run = timeline.runs[runId]
    if (!run) continue
    if (!run.plan) continue
    run.plan.steps.forEach((step, index) => {
      for (const ref of step.artifactRefs ?? []) {
        if (links[ref]) continue
        links[ref] = {
          ref,
          runId: run.id,
          runGoal: run.goal,
          stepId: step.id,
          stepTitle: step.title,
          stepIndex: index,
          toolCallIds: mergeUniqueStrings([step.toolCallId, ...(step.toolCallIds ?? [])]),
        }
      }
    })
  }

  return links
}
