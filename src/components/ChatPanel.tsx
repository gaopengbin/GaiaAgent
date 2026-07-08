import {
  BotMessageSquare,
  CircleCheck,
  CircleX,
  Database,
  Download,
  EyeOff,
  ExternalLink,
  ListChecks,
  Loader2,
  MapPin,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import type { FileUIPart } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AgentRunView,
  AgentTaskPlanStepView,
  AgentTimelineState,
  AgentToolView,
  AiSandboxApplyResult,
  AiSandboxPatch,
  SpatialAsset,
} from '../agent'
import { analysisReviewSummary } from '../agent/scene-analysis-summary'
import {
  buildBusinessWorkflowPromptFromSelectedRefs,
  buildBusinessWorkflowSuggestions,
  businessWorkflowCompatibleAssets,
  businessWorkflowTemplates,
  type BusinessWorkflowSuggestion,
} from '../agent/business-workflows'
import type { ChatSessionSummary } from '../hooks/useTauriAgent'
import { cn } from '../lib/utils'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from './ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from './ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputAttachments,
} from './ai-elements/prompt-input'
import { Reasoning, ReasoningContent, ReasoningTrigger } from './ai-elements/reasoning'
import { Suggestion, Suggestions } from './ai-elements/suggestion'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from './ai-elements/tool'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

type ApprovalMode = 'safe' | 'balanced' | 'auto'

interface ChatPanelProps {
  timeline: AgentTimelineState
  sessions: ChatSessionSummary[]
  currentSessionId: string
  statusText: string
  approvalMode: ApprovalMode
  activeSceneObject?: SpatialAsset | null
  recentSceneObjects: SpatialAsset[]
  sceneAssets: Record<string, SpatialAsset>
  isBusy: boolean
  canSend: boolean
  onSend: (text: string, files?: FileUIPart[]) => void
  onConfirm: () => void
  onCancel: () => void
  onNewSession: () => void
  onSwitchSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onClearContext: () => Promise<void> | void
  onCompactContext: () => Promise<void> | void
  onApprovalModeChange: (mode: ApprovalMode) => Promise<void> | void
  onOpenSceneObject: (asset: SpatialAsset) => Promise<void> | void
  onExportDeliverablesPackage: () => Promise<void> | void
  onRetryTaskStep: (runId: string, stepId: string) => Promise<void> | void
  onSkipTaskStep: (runId: string, stepId: string) => Promise<void> | void
  onReplanTaskStep: (runId: string, stepId: string) => Promise<void> | void
  onApplySandboxPatch: (patchId: string) => Promise<AiSandboxApplyResult> | void
  highlightedTaskStep?: HighlightedTaskStep | null
}

export interface HighlightedTaskStep {
  runId: string
  stepId: string
  sequence: number
}

interface AgentSessionStatus {
  sessionId: string
  turnCount: number
  estimatedBytes: number
  compacted: boolean
  compactionKind?: string | null
  summary?: string | null
}

function toolState(tool: AgentToolView) {
  switch (tool.status) {
    case 'requested':
      return 'input-streaming' as const
    case 'awaiting-approval':
      return 'approval-requested' as const
    case 'running':
      return 'input-available' as const
    case 'completed':
      return 'output-available' as const
    case 'failed':
      return 'output-error' as const
    case 'cancelled':
      return 'output-denied' as const
  }
}

function parseSandboxPatchFromTool(tool: AgentToolView): AiSandboxPatch | null {
  const raw = tool.result?.data ?? tool.result?.output
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!record.patch || typeof record.patch !== 'object') {
    return null
  }
  const patch = record.patch as AiSandboxPatch
  if (!patch.id || !patch.target || !Array.isArray(patch.changedPaths)) return null
  return patch
}

function sandboxPatchesFromRun(run: AgentRunView): AiSandboxPatch[] {
  const seen = new Set<string>()
  const patches: AiSandboxPatch[] = []
  for (const tool of run.tools) {
    const patch = parseSandboxPatchFromTool(tool)
    if (!patch || seen.has(patch.id)) continue
    seen.add(patch.id)
    patches.push(patch)
  }
  return patches
}

const sandboxPatchUiStateKey = 'gaiaagent:sandbox-patch-ui-state'

function loadSandboxPatchUiState(): {
  applied: Record<string, boolean>
  dismissed: Record<string, boolean>
} {
  try {
    const raw = localStorage.getItem(sandboxPatchUiStateKey)
    if (!raw) return { applied: {}, dismissed: {} }
    const parsed = JSON.parse(raw) as {
      applied?: Record<string, boolean>
      dismissed?: Record<string, boolean>
    }
    return { applied: parsed.applied ?? {}, dismissed: parsed.dismissed ?? {} }
  } catch {
    return { applied: {}, dismissed: {} }
  }
}

function saveSandboxPatchUiState(state: {
  applied: Record<string, boolean>
  dismissed: Record<string, boolean>
}) {
  localStorage.setItem(sandboxPatchUiStateKey, JSON.stringify(state))
}

function pendingLabel(run: AgentRunView, t: (key: string) => string) {
  if (run.tools.some((tool) => tool.status === 'awaiting-approval')) {
    return t('chat.waitingApproval')
  }
  if (run.tools.some((tool) => tool.status === 'running')) {
    return t('chat.runningTool')
  }
  if (run.messages.length > 0 && run.messages.some((message) => message.streaming)) {
    return t('chat.streaming')
  }
  if (run.tools.some((tool) => tool.status === 'completed' || tool.status === 'failed')) {
    return t('chat.waitingFollowup')
  }
  if (run.reasoning?.status === 'streaming') {
    return t('chat.thinking')
  }
  return t('chat.waitingFirstByte')
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const nativeRunTokenBudget = 64_000

function tokenBudgetWarning(totalTokens?: number) {
  if (!totalTokens) return null
  const ratio = totalTokens / nativeRunTokenBudget
  if (ratio >= 0.95) {
    return '本轮已接近 token 上限，后续工具结果会被摘要化。建议压缩上下文或开启新会话。'
  }
  if (ratio >= 0.8) {
    return '本轮上下文较大，GaiaAgent 会优先使用工具结果摘要，避免继续塞入大对象。'
  }
  return null
}

function approvalModeLabel(mode: ApprovalMode) {
  switch (mode) {
    case 'safe':
      return '安全'
    case 'auto':
      return '自动'
    case 'balanced':
      return '平衡'
  }
}

function approvalModeTitle(mode: ApprovalMode) {
  switch (mode) {
    case 'safe':
      return '安全模式：只读自动执行，地图修改、网络、文件和进程需要确认'
    case 'auto':
      return '自动模式：尽量自动执行工具，仍受白名单、超时和安全边界限制'
    case 'balanced':
      return '平衡模式：地图操作自动执行，网络、文件和进程需要确认'
  }
}

function sceneObjectLabel(asset: SpatialAsset) {
  return asset.name || asset.id
}

function sceneObjectReferenceText(asset: SpatialAsset, label = '当前对象') {
  return `${label}：${sceneObjectLabel(asset)}（${asset.ref}）`
}

function runContinuationLabel(run: AgentRunView) {
  if (run.continuation?.kind === 'replan') {
    return `重新规划后继续执行${run.continuation.parentStepId ? ` · ${run.continuation.parentStepId}` : ''}`
  }
  return null
}

function workflowReadinessLabel(readiness: 'ready' | 'partial' | 'needs-data') {
  switch (readiness) {
    case 'ready':
      return '已匹配数据'
    case 'partial':
      return '需补数据'
    case 'needs-data':
      return '导入数据后可用'
  }
}

function workflowSuggestionClass(readiness: 'ready' | 'partial' | 'needs-data') {
  if (readiness === 'ready') {
    return 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-200'
  }
  if (readiness === 'partial') {
    return 'border-sky-500/25 bg-sky-500/5 text-sky-700 hover:bg-sky-500/10 dark:text-sky-200'
  }
  return 'border-muted-foreground/20 bg-muted/20 text-muted-foreground hover:bg-muted/35'
}

export interface BusinessWorkflowEntryCardModel {
  id: string
  title: string
  description: string
  readiness: 'ready' | 'partial' | 'needs-data'
  readinessLabel: string
  prompt: string
  matchedAssetCount: number
  missingText: string
  toolText: string
  previewStepText: string
  expectedDeliverableText: string
  reportFocusText: string
}

export function buildBusinessWorkflowEntryCards(
  suggestions: BusinessWorkflowSuggestion[],
): BusinessWorkflowEntryCardModel[] {
  return suggestions.map((suggestion) => ({
    id: suggestion.template.id,
    title: suggestion.template.title,
    description: suggestion.template.description,
    readiness: suggestion.readiness,
    readinessLabel: workflowReadinessLabel(suggestion.readiness),
    prompt: suggestion.prompt,
    matchedAssetCount: suggestion.matchedAssetRefs.length,
    missingText:
      suggestion.missingRoles.length > 0
        ? `缺少：${suggestion.missingRoles.join('、')}`
        : '数据已匹配',
    toolText: suggestion.template.analysisTools.slice(0, 3).join('、'),
    previewStepText: suggestion.template.workflowSteps.slice(0, 3).join(' → '),
    expectedDeliverableText: suggestion.template.reportFocus.slice(0, 4).join('、'),
    reportFocusText: suggestion.template.reportFocus.slice(0, 3).join('、'),
  }))
}

const FOLLOWUP_SUGGESTION_ANCHORS = [
  '比如',
  '例如',
  '下一步',
  '进一步',
  '继续做',
  '可以继续',
  '想进一步',
]

function findLastFollowupAnchorIndex(lines: string[]) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (FOLLOWUP_SUGGESTION_ANCHORS.some((anchor) => line.includes(anchor))) return index
  }
  return -1
}

function cleanupFollowupSuggestionLine(line: string) {
  return line
    .replace(/^\s*(?:[-*+]|[0-9]+[.)、]|[（(]?[一二三四五六七八九十]+[）)、.])\s*/, '')
    .replace(/^\s*(?:比如|例如|下一步|进一步|继续做|可以继续|想进一步)[：:，,\s]*/, '')
    .replace(/\*\*/g, '')
    .trim()
    .replace(/[？?。；;：:，,]\s*$/, '')
}

export function extractFollowupSuggestions(text: string, limit = 4): string[] {
  const lines = text.split(/\r?\n/)
  const anchorIndex = findLastFollowupAnchorIndex(lines)
  if (anchorIndex < 0) return []

  const suggestions: string[] = []
  for (const line of lines.slice(anchorIndex + 1)) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (suggestions.length > 0) break
      continue
    }
    const looksLikeListItem = /^([-*+]|\d+[.)、]|[（(]?[一二三四五六七八九十]+[）)、.])\s+/.test(
      trimmed,
    )
    if (!looksLikeListItem) {
      if (suggestions.length > 0) break
      continue
    }
    const suggestion = cleanupFollowupSuggestionLine(trimmed)
    if (suggestion.length >= 4 && !suggestions.includes(suggestion)) {
      suggestions.push(suggestion)
    }
    if (suggestions.length >= limit) break
  }

  return suggestions
}

export interface BusinessWorkflowRunContext {
  id: string
  title: string
  domain: string
  toolText: string
  expectedDeliverableText: string
  workflowSteps: string[]
}

export function businessWorkflowRunContextFromGoal(
  goal: string,
): BusinessWorkflowRunContext | null {
  const template = businessWorkflowTemplates.find((candidate) =>
    goal.trimStart().startsWith(`按“${candidate.title}”业务模板执行一次 GIS 分析。`),
  )
  if (!template) return null
  return {
    id: template.id,
    title: template.title,
    domain: template.domain,
    toolText: template.analysisTools.slice(0, 3).join('、'),
    expectedDeliverableText: template.reportFocus.slice(0, 4).join('、'),
    workflowSteps: template.workflowSteps,
  }
}

export interface BusinessWorkflowRunProgress extends BusinessWorkflowRunContext {
  completedPlanSteps: number
  totalPlanSteps: number
  completedTemplateSteps: number
  totalTemplateSteps: number
  currentTemplateStepIndex: number
  currentTemplateStep: string
}

function isTaskPlanStepDone(status: AgentTaskPlanStepView['status']) {
  return status === 'completed' || status === 'skipped'
}

export function businessWorkflowRunProgress(run: AgentRunView): BusinessWorkflowRunProgress | null {
  const context = businessWorkflowRunContextFromGoal(run.goal)
  if (!context) return null
  const totalPlanSteps = run.plan?.steps.length ?? 0
  const completedPlanSteps =
    run.plan?.steps.filter((step) => isTaskPlanStepDone(step.status)).length ?? 0
  const totalTemplateSteps = context.workflowSteps.length
  const ratio = totalPlanSteps > 0 ? completedPlanSteps / totalPlanSteps : 0
  const completedTemplateSteps =
    run.status === 'completed'
      ? totalTemplateSteps
      : Math.min(totalTemplateSteps, Math.floor(ratio * totalTemplateSteps))
  const currentTemplateStepIndex =
    totalTemplateSteps === 0 ? 0 : Math.min(totalTemplateSteps - 1, completedTemplateSteps)
  return {
    ...context,
    completedPlanSteps,
    totalPlanSteps,
    completedTemplateSteps,
    totalTemplateSteps,
    currentTemplateStepIndex,
    currentTemplateStep: context.workflowSteps[currentTemplateStepIndex] ?? '等待任务计划生成',
  }
}

export interface BusinessWorkflowCompletionSummary {
  title: string
  artifactCount: number
  availableArtifactCount: number
  analysisResultCount: number
  pendingReviewCount: number
  completedReviewCount: number
  artifactLabels: string[]
  artifacts: Array<{
    ref: string
    label: string
    analysisResult: boolean
  }>
  continueReviewPrompt?: string
}

export function businessWorkflowCompletionSummary(
  run: AgentRunView,
  sceneAssets: Record<string, SpatialAsset>,
): BusinessWorkflowCompletionSummary | null {
  const context = businessWorkflowRunContextFromGoal(run.goal)
  if (!context || run.status !== 'completed') return null
  const artifactRefs = [
    ...new Set(run.plan?.steps.flatMap((step) => step.artifactRefs ?? []) ?? []),
  ]
  const availableAssets = artifactRefs
    .map((ref) => sceneAssets[ref])
    .filter((asset): asset is SpatialAsset => !!asset)
  const analysisAssets = availableAssets.filter(
    (asset) =>
      asset.kind === 'asset' &&
      (asset.type === 'analysis-result' || !!asset.metadata?.analysisType),
  )
  const reviewSummaries = analysisAssets
    .map((asset) => analysisReviewSummary(asset))
    .filter(
      (summary): summary is NonNullable<ReturnType<typeof analysisReviewSummary>> => !!summary,
    )
  return {
    title: context.title,
    artifactCount: artifactRefs.length,
    availableArtifactCount: availableAssets.length,
    analysisResultCount: analysisAssets.length,
    pendingReviewCount: reviewSummaries.reduce((total, summary) => total + summary.pending, 0),
    completedReviewCount: reviewSummaries.reduce((total, summary) => total + summary.completed, 0),
    artifactLabels: availableAssets.slice(0, 4).map((asset) => sceneObjectLabel(asset)),
    artifacts: availableAssets.slice(0, 4).map((asset) => ({
      ref: asset.ref,
      label: sceneObjectLabel(asset),
      analysisResult:
        asset.kind === 'asset' &&
        (asset.type === 'analysis-result' || !!asset.metadata?.analysisType),
    })),
    continueReviewPrompt: reviewSummaries.some((summary) => summary.pending > 0)
      ? `继续处理“${context.title}”的待复核事项。请打开冲突清单，优先处理待复核和高风险记录，并在完成后更新复核状态。`
      : undefined,
  }
}

function RunPendingBubble({ run }: { run: AgentRunView }) {
  const { t } = useTranslation()
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - run.startedAt) / 1000)),
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - run.startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [run.startedAt])

  if (run.status !== 'running') return null
  if (run.messages.some((message) => message.streaming && message.text.trim().length > 0))
    return null
  if (run.tools.some((tool) => tool.status === 'awaiting-approval')) return null

  return (
    <Message from="assistant">
      <MessageContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
          <span>{pendingLabel(run, t)}</span>
          <span className="ml-auto tabular-nums text-[11px] text-muted-foreground/70">
            {elapsed}s
          </span>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" />
        </div>
      </MessageContent>
    </Message>
  )
}

function StreamingOutputIndicator() {
  const { t } = useTranslation()
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin text-primary" aria-hidden="true" />
      <span>{t('chat.streaming')}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        <span className="h-1 w-1 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.2s]" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.1s]" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-primary/60" />
      </span>
    </div>
  )
}

function attachmentImageUrl(file: {
  filename?: string
  mediaType?: string
  url?: string
  dataUrl?: string
}) {
  const rawUrl = file.url ?? file.dataUrl
  if (rawUrl?.startsWith('data:image/') || rawUrl?.startsWith('blob:')) return rawUrl
  if (rawUrl && file.mediaType?.startsWith('image/') && /^[A-Za-z0-9+/=\r\n]+$/.test(rawUrl)) {
    return `data:${file.mediaType};base64,${rawUrl.replace(/\s+/g, '')}`
  }
  return rawUrl
}

function isImageAttachment(file: {
  filename?: string
  mediaType?: string
  url?: string
  dataUrl?: string
}) {
  if (file.mediaType?.startsWith('image/')) return true
  const url = attachmentImageUrl(file)
  if (url?.startsWith('data:image/') || url?.startsWith('blob:')) return true
  const filename = file.filename?.toLowerCase() ?? ''
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(filename)
}

function ChatImageAttachmentPreview() {
  const attachments = usePromptInputAttachments()
  const images = attachments.files.filter(isImageAttachment)
  if (images.length === 0) return null

  return (
    <PromptInputHeader className="w-full border-b border-border/70 pb-2">
      <div className="flex w-full gap-2 overflow-x-auto">
        {images.map((file) => (
          <div
            key={file.id}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
            title={file.filename}
          >
            <img
              src={attachmentImageUrl(file)}
              alt={file.filename ?? '粘贴的图片'}
              className="size-full object-cover"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon-xs"
              className="absolute right-1 top-1 size-5 opacity-90 shadow-sm"
              onClick={() => attachments.remove(file.id)}
              aria-label="移除图片"
            >
              <CircleX className="size-3" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
    </PromptInputHeader>
  )
}

function UserAttachmentStrip({ attachments }: { attachments?: AgentRunView['userAttachments'] }) {
  const images = attachments?.filter(isImageAttachment) ?? []
  if (images.length === 0) return null

  return (
    <div className="grid max-w-[min(22rem,70vw)] grid-cols-2 gap-2 sm:grid-cols-3">
      {images.map((attachment, index) => {
        const url = attachmentImageUrl(attachment)
        if (!url) return null
        return (
          <a
            key={`${url}:${index}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-border/70 bg-background/50"
            title={attachment.filename ?? `image-${index + 1}`}
          >
            <img
              src={url}
              alt={attachment.filename ?? `image-${index + 1}`}
              className="h-24 w-full object-cover"
            />
          </a>
        )
      })}
    </div>
  )
}

function taskStepStatusLabel(status: AgentTaskPlanStepView['status']) {
  switch (status) {
    case 'planned':
      return '已规划'
    case 'requested':
      return '已规划'
    case 'awaiting-approval':
      return '待确认'
    case 'running':
      return '执行中'
    case 'retrying':
      return '重试中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'skipped':
      return '已跳过'
    case 'needs-planning':
      return '需重规划'
    case 'cancelled':
      return '已取消'
  }
}

function taskStepTone(status: AgentTaskPlanStepView['status']) {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'failed':
      return 'border-destructive/30 bg-destructive/10 text-destructive'
    case 'awaiting-approval':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200'
    case 'running':
      return 'border-primary/30 bg-primary/10 text-primary'
    case 'retrying':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200'
    case 'skipped':
      return 'border-muted bg-muted/40 text-muted-foreground'
    case 'needs-planning':
      return 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-200'
    case 'cancelled':
      return 'border-muted bg-muted/50 text-muted-foreground'
    case 'planned':
    case 'requested':
      return 'border-border bg-muted/25 text-muted-foreground'
  }
}

function taskStepResultSummary(step: AgentTaskPlanStepView) {
  if (step.error?.message) return step.error.message
  const output = step.result?.output
  const data = step.result?.data
  const imageCandidate =
    typeof output === 'string'
      ? output
      : typeof data === 'string'
        ? data
        : data && typeof data === 'object' && 'dataUrl' in data
          ? (data as { dataUrl?: unknown }).dataUrl
          : undefined
  if (typeof imageCandidate === 'string' && imageCandidate.includes('data:image/')) {
    return '已生成图片结果'
  }
  if (typeof output === 'string' && output.trim()) return output.trim().slice(0, 120)
  if (step.result?.data !== undefined) return '已生成结构化结果'
  return null
}

function taskStepDomKey(runId: string, stepId: string) {
  return `${runId}__${stepId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function sceneAssetKindLabel(asset: SpatialAsset) {
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

function sceneAssetSourceLabel(asset: SpatialAsset) {
  if (asset.source === 'user') return '用户'
  if (asset.source === 'agent') return 'AI'
  if (asset.source === 'mcp') return 'MCP'
  if (asset.source === 'import') return '导入'
  if (asset.source === 'snapshot') return '快照'
  if (asset.lastCallId?.startsWith('scene-panel:')) return '面板'
  if (asset.lastCallId) return 'AI'
  return '快照'
}

export interface SceneArtifactChipModel {
  reference: string
  label: string
  detail: string
  title: string
  available: boolean
  hidden: boolean
  locked: boolean
}

export function buildSceneArtifactChipModel(
  asset: SpatialAsset | undefined,
  reference: string,
): SceneArtifactChipModel {
  if (!asset) {
    return {
      reference,
      label: reference,
      detail: '尚未同步',
      title: `对象尚未同步：${reference}`,
      available: false,
      hidden: false,
      locked: false,
    }
  }

  const status = asset.visible === false ? '隐藏' : '可见'
  const lockStatus = asset.locked ? ' · 锁定' : ''
  const detail = `${sceneAssetKindLabel(asset)} · ${sceneAssetSourceLabel(asset)} · ${status}${lockStatus}`

  return {
    reference,
    label: asset.name || asset.id || reference,
    detail,
    title: `定位 ${asset.name || asset.id || reference}（${detail}）`,
    available: true,
    hidden: asset.visible === false,
    locked: asset.locked === true,
  }
}

function SandboxPatchSummary({ patch }: { patch: AiSandboxPatch }) {
  const changed = patch.changedPaths.slice(0, 8)
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 p-3">
      <p className="text-[11px] text-muted-foreground">
        变更 {patch.changedPaths.length} 项
        {patch.validation?.messages?.length ? ` · ${patch.validation.messages[0]}` : ''}
      </p>
      {changed.length > 0 && (
        <ul className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
          {changed.map((path) => (
            <li key={path} className="truncate">
              {path}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SandboxPatchReviewDialog({
  patch,
  busy,
  applied,
  error,
  onApply,
  onClose,
}: {
  patch: AiSandboxPatch | null
  busy: boolean
  applied: boolean
  error?: string
  onApply: (patchId: string) => Promise<void> | void
  onClose: (patchId: string) => void
}) {
  const targetLabel = patch?.target === 'mcp-servers' ? 'MCP 服务器配置' : '模型设置'
  return (
    <Dialog open={!!patch} onOpenChange={(open) => !open && patch && onClose(patch.id)}>
      <DialogContent className="max-w-lg border-border/80 bg-background/95 shadow-2xl backdrop-blur">
        {patch && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                确认应用 AI 配置补丁
              </DialogTitle>
              <DialogDescription>
                AI 已生成 {targetLabel}{' '}
                修改，但还没有写入真实配置。确认后会备份当前配置，并尝试启动相关 MCP。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {patch.reason && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                  {patch.reason}
                </div>
              )}
              <SandboxPatchSummary patch={patch} />
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => onClose(patch.id)}
              >
                稍后处理
              </Button>
              <Button
                type="button"
                disabled={busy || applied}
                onClick={() => void onApply(patch.id)}
              >
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <CircleCheck aria-hidden="true" />
                )}
                {applied ? '已应用' : '应用配置并启动 MCP'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SandboxPatchCard({
  patch,
  busy,
  applied,
  error,
  onApply,
}: {
  patch: AiSandboxPatch
  busy: boolean
  applied: boolean
  error?: string
  onApply: () => Promise<void> | void
}) {
  const targetLabel = patch.target === 'mcp-servers' ? 'MCP 服务器配置' : '模型设置'
  const isApplied = applied || patch.status === 'applied'
  return (
    <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">AI 配置补丁待应用</p>
            <span className="rounded-full border border-primary/25 px-1.5 py-0.5 text-[10px] text-primary">
              {targetLabel}
            </span>
          </div>
          {patch.reason && <p className="mt-1 text-muted-foreground">{patch.reason}</p>}
          <div className="mt-2">
            <SandboxPatchSummary patch={patch} />
          </div>
          {error && (
            <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" size="sm" disabled={busy || isApplied} onClick={onApply}>
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <CircleCheck aria-hidden="true" />
          )}
          {isApplied ? '已应用' : '应用配置并启动 MCP'}
        </Button>
      </div>
    </div>
  )
}

function TaskPlanCard({
  run,
  sceneAssets,
  onConfirm,
  onCancel,
  onOpenSceneObject,
  onRetryTaskStep,
  onSkipTaskStep,
  onReplanTaskStep,
  highlightedTaskStep,
}: {
  run: AgentRunView
  sceneAssets: Record<string, SpatialAsset>
  onConfirm: () => void
  onCancel: () => void
  onOpenSceneObject: (asset: SpatialAsset) => Promise<void> | void
  onRetryTaskStep: (runId: string, stepId: string) => Promise<void> | void
  onSkipTaskStep: (runId: string, stepId: string) => Promise<void> | void
  onReplanTaskStep: (runId: string, stepId: string) => Promise<void> | void
  highlightedTaskStep?: HighlightedTaskStep | null
}) {
  if (!run.plan || run.plan.steps.length === 0) return null

  const awaitingApproval = run.plan.status === 'awaiting-approval'
  const completed = run.plan.steps.filter((step) => step.status === 'completed').length
  const failed = run.plan.status === 'failed'
  const running = run.plan.status === 'running'

  return (
    <div className="rounded-xl border border-border bg-card/70 p-3 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ListChecks className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">任务计划</p>
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {completed}/{run.plan.steps.length} 步
            </span>
            {awaitingApproval && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-200">
                等待确认
              </span>
            )}
            {running && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                执行中
              </span>
            )}
            {failed && (
              <span className="rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                有失败步骤
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{run.goal}</p>
        </div>
      </div>

      <ol className="mt-3 space-y-2">
        {run.plan.steps.map((step, index) => {
          const linkedTools = run.tools.filter(
            (tool) =>
              tool.call.id === (step.toolCallId ?? step.id) ||
              tool.call.id === step.id ||
              (step.toolCallIds ?? []).includes(tool.call.id),
          )
          const tool = linkedTools[0]
          const resultSummary = taskStepResultSummary(step)
          const highlighted =
            highlightedTaskStep?.runId === run.id && highlightedTaskStep.stepId === step.id
          return (
            <li
              key={step.id}
              data-task-step-key={taskStepDomKey(run.id, step.id)}
              className={`rounded-lg border border-border/70 bg-background/50 p-2 transition-colors ${
                highlighted
                  ? 'border-primary/60 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]'
                  : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {`${index + 1}. ${step.title}`}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${taskStepTone(
                    step.status,
                  )}`}
                >
                  {taskStepStatusLabel(step.status)}
                </span>
              </div>
              {tool?.approvalReason && (
                <p className="mt-1 text-[11px] text-muted-foreground">{tool.approvalReason}</p>
              )}
              {linkedTools.length > 0 && (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  工具：{linkedTools.map((tool) => tool.call.name).join(' → ')}
                </p>
              )}
              {step.artifactRefs && step.artifactRefs.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">产物</span>
                  {step.artifactRefs.slice(0, 4).map((reference) => {
                    const asset = sceneAssets[reference]
                    const chip = buildSceneArtifactChipModel(asset, reference)
                    return (
                      <Button
                        key={reference}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!chip.available}
                        title={chip.title}
                        className={`h-auto max-w-48 rounded-xl border-primary/25 bg-primary/5 px-2 py-1 text-left text-[10px] text-primary hover:bg-primary/10 disabled:border-border disabled:bg-muted/20 disabled:text-muted-foreground ${
                          chip.hidden
                            ? 'border-muted-foreground/25 bg-muted/15 text-muted-foreground'
                            : ''
                        }`}
                        onClick={() => {
                          if (asset) void onOpenSceneObject(asset)
                        }}
                      >
                        <span className="flex min-w-0 items-start gap-1.5">
                          {chip.hidden ? (
                            <EyeOff className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                          ) : (
                            <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{chip.label}</span>
                            <span className="block truncate opacity-80">{chip.detail}</span>
                          </span>
                        </span>
                      </Button>
                    )
                  })}
                  {step.artifactRefs.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{step.artifactRefs.length - 4}
                    </span>
                  )}
                </div>
              )}
              {resultSummary && (
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                  {resultSummary}
                </p>
              )}
              {step.status === 'failed' && (
                <div className="mt-2 flex justify-end gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => void onRetryTaskStep(run.id, step.id)}
                  >
                    重试
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-muted-foreground"
                    onClick={() => void onSkipTaskStep(run.id, step.id)}
                  >
                    跳过
                  </Button>
                </div>
              )}
              {step.status === 'needs-planning' && (
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 border-primary/30 bg-primary/5 px-2 text-[11px] text-primary hover:bg-primary/10"
                    onClick={() => void onReplanTaskStep(run.id, step.id)}
                  >
                    重新规划
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {awaitingApproval && (
        <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            取消任务
          </Button>
          <Button type="button" size="sm" onClick={onConfirm}>
            确认执行
          </Button>
        </div>
      )}
    </div>
  )
}

function EmptyChatCanvas({ title, description }: { title: string; description: string }) {
  return (
    <div className="relative flex size-full min-h-[360px] items-center justify-center overflow-hidden px-6">
      <div className="relative flex max-w-72 flex-col items-center text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border/80 bg-muted/30 text-primary shadow-sm">
          <Sparkles className="size-6" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-2 max-w-64 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-[10px] text-muted-foreground">
          <span className="rounded-full border border-border/70 bg-muted/20 px-2 py-1">
            地图操作
          </span>
          <span className="rounded-full border border-border/70 bg-muted/20 px-2 py-1">
            MCP 工具
          </span>
          <span className="rounded-full border border-border/70 bg-muted/20 px-2 py-1">
            上下文记忆
          </span>
          <span className="rounded-full border border-border/70 bg-muted/20 px-2 py-1">
            业务模板
          </span>
        </div>
      </div>
    </div>
  )
}

export function ChatPanel({
  timeline,
  sessions,
  currentSessionId,
  statusText,
  approvalMode,
  activeSceneObject,
  recentSceneObjects,
  sceneAssets,
  isBusy,
  canSend,
  onSend,
  onConfirm,
  onCancel,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
  onClearContext,
  onCompactContext,
  onApprovalModeChange,
  onOpenSceneObject,
  onExportDeliverablesPackage,
  onRetryTaskStep,
  onSkipTaskStep,
  onReplanTaskStep,
  onApplySandboxPatch,
  highlightedTaskStep,
}: ChatPanelProps) {
  const { t } = useTranslation()
  const suggestions = t('suggestions', { returnObjects: true }) as string[]
  const workflowSuggestions = useMemo(
    () => buildBusinessWorkflowSuggestions(sceneAssets),
    [sceneAssets],
  )
  const workflowEntryCards = useMemo(
    () => buildBusinessWorkflowEntryCards(workflowSuggestions),
    [workflowSuggestions],
  )
  const runs = timeline.runOrder.map((id) => timeline.runs[id]).filter(Boolean)
  const latestCompletedAssistantMessageId = useMemo(() => {
    for (const run of [...runs].reverse()) {
      for (const message of [...run.messages].reverse()) {
        if (!message.streaming && message.text.trim()) return message.id
      }
    }
    return null
  }, [runs])
  const [contextOpen, setContextOpen] = useState(false)
  const [contextBusy, setContextBusy] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<AgentSessionStatus | null>(null)
  const [workflowTemplatesOpen, setWorkflowTemplatesOpen] = useState(false)
  const [workflowAssetSelections, setWorkflowAssetSelections] = useState<
    Record<string, Record<string, string>>
  >({})
  const [applyingSandboxPatchIds, setApplyingSandboxPatchIds] = useState<Record<string, boolean>>(
    {},
  )
  const [appliedSandboxPatchIds, setAppliedSandboxPatchIds] = useState<Record<string, boolean>>(
    () => loadSandboxPatchUiState().applied,
  )
  const [dismissedSandboxPatchIds, setDismissedSandboxPatchIds] = useState<Record<string, boolean>>(
    () => loadSandboxPatchUiState().dismissed,
  )
  const [activeSandboxPatchId, setActiveSandboxPatchId] = useState<string | null>(null)
  const [sandboxPatchErrors, setSandboxPatchErrors] = useState<Record<string, string>>({})
  const sandboxPatches = useMemo(() => runs.flatMap(sandboxPatchesFromRun), [runs])
  const activeSandboxPatch = useMemo(
    () => sandboxPatches.find((patch) => patch.id === activeSandboxPatchId) ?? null,
    [activeSandboxPatchId, sandboxPatches],
  )
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const readyWorkflowCount = workflowEntryCards.filter(
    (workflow) => workflow.readiness === 'ready',
  ).length
  const partialWorkflowCount = workflowEntryCards.filter(
    (workflow) => workflow.readiness === 'partial',
  ).length
  const workflowTemplateSummary =
    readyWorkflowCount > 0
      ? `${readyWorkflowCount} 个可开始`
      : partialWorkflowCount > 0
        ? `${partialWorkflowCount} 个待补数据`
        : '导入数据后可用'
  const showInlineWorkflowTemplates = false

  useEffect(() => {
    saveSandboxPatchUiState({
      applied: appliedSandboxPatchIds,
      dismissed: dismissedSandboxPatchIds,
    })
  }, [appliedSandboxPatchIds, dismissedSandboxPatchIds])

  const handleApplySandboxPatch = useCallback(
    async (patchId: string) => {
      setApplyingSandboxPatchIds((current) => ({ ...current, [patchId]: true }))
      try {
        setSandboxPatchErrors((current) => {
          const next = { ...current }
          delete next[patchId]
          return next
        })
        await onApplySandboxPatch(patchId)
        setAppliedSandboxPatchIds((current) => ({ ...current, [patchId]: true }))
        setActiveSandboxPatchId((current) => (current === patchId ? null : current))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setSandboxPatchErrors((current) => ({ ...current, [patchId]: message }))
      } finally {
        setApplyingSandboxPatchIds((current) => {
          const next = { ...current }
          delete next[patchId]
          return next
        })
      }
    },
    [onApplySandboxPatch],
  )

  useEffect(() => {
    if (activeSandboxPatchId) return
    const next = sandboxPatches.find(
      (patch) =>
        patch.status !== 'applied' &&
        !appliedSandboxPatchIds[patch.id] &&
        !dismissedSandboxPatchIds[patch.id],
    )
    if (!next) return
    let cancelled = false
    invoke<AiSandboxPatch>('ai_sandbox_get_patch', { patchId: next.id })
      .then((actual) => {
        if (cancelled) return
        if (actual.status === 'applied') {
          setAppliedSandboxPatchIds((current) => ({ ...current, [next.id]: true }))
          return
        }
        setActiveSandboxPatchId(next.id)
      })
      .catch(() => {
        if (!cancelled) setActiveSandboxPatchId(next.id)
      })
    return () => {
      cancelled = true
    }
  }, [activeSandboxPatchId, appliedSandboxPatchIds, dismissedSandboxPatchIds, sandboxPatches])

  useEffect(() => {
    if (!highlightedTaskStep) return
    const key = taskStepDomKey(highlightedTaskStep.runId, highlightedTaskStep.stepId)
    const element = document.querySelector(`[data-task-step-key="${key}"]`)
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightedTaskStep])

  const loadContextStatus = useCallback(async () => {
    setContextBusy(true)
    try {
      const status = await invoke<AgentSessionStatus>('agent_session_status', {
        sessionId: currentSessionId,
      })
      setSessionStatus(status)
    } catch (error) {
      console.warn('[agent] failed to load session context status:', error)
      setSessionStatus(null)
    } finally {
      setContextBusy(false)
    }
  }, [currentSessionId])

  useEffect(() => {
    if (contextOpen) void loadContextStatus()
  }, [contextOpen, loadContextStatus])

  const insertPromptText = useCallback((text: string) => {
    const textarea = promptTextareaRef.current
    if (!textarea) return
    const prefix = textarea.value && !textarea.value.endsWith(' ') ? ' ' : ''
    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? start
    textarea.value = `${textarea.value.slice(0, start)}${prefix}${text}${textarea.value.slice(end)}`
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    const nextCursor = start + prefix.length + text.length
    textarea.setSelectionRange(nextCursor, nextCursor)
    textarea.focus()
  }, [])

  const insertActiveSceneObjectReference = useCallback(() => {
    if (!activeSceneObject) return
    insertPromptText(sceneObjectReferenceText(activeSceneObject))
  }, [activeSceneObject, insertPromptText])

  const setWorkflowRoleSelection = useCallback(
    (workflowId: string, role: string, assetRef: string) => {
      setWorkflowAssetSelections((current) => ({
        ...current,
        [workflowId]: {
          ...(current[workflowId] ?? {}),
          [role]: assetRef,
        },
      }))
    },
    [],
  )

  const primaryRecentSceneObject =
    recentSceneObjects.find((asset) => asset.ref !== activeSceneObject?.ref) ?? null
  const inputUnavailableMessage =
    !canSend && !isBusy ? statusText || '正在连接 AI 代理，输入暂不可用。' : null

  return (
    <>
      <SandboxPatchReviewDialog
        patch={activeSandboxPatch}
        busy={!!(activeSandboxPatch && applyingSandboxPatchIds[activeSandboxPatch.id])}
        applied={!!(activeSandboxPatch && appliedSandboxPatchIds[activeSandboxPatch.id])}
        error={activeSandboxPatch ? sandboxPatchErrors[activeSandboxPatch.id] : undefined}
        onApply={(patchId) => handleApplySandboxPatch(patchId)}
        onClose={(patchId) => {
          setDismissedSandboxPatchIds((current) => ({ ...current, [patchId]: true }))
          setActiveSandboxPatchId(null)
        }}
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <BotMessageSquare className="size-4 text-primary" aria-hidden="true" />
          <span className="mr-auto text-xs font-semibold text-foreground">{t('chat.title')}</span>
          <Select
            value={approvalMode}
            disabled={isBusy}
            onValueChange={(value) => void onApprovalModeChange(value as ApprovalMode)}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-[86px] shrink-0 border-border bg-secondary px-2 text-[11px]"
              title={approvalModeTitle(approvalMode)}
              aria-label="Agent 执行模式"
            >
              <ShieldCheck className="size-3 text-primary" aria-hidden="true" />
              <SelectValue>{approvalModeLabel(approvalMode)}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="w-48">
              <SelectItem value="safe">
                <div className="flex flex-col">
                  <span>安全模式</span>
                  <span className="text-[10px] text-muted-foreground">只读自动，其余确认</span>
                </div>
              </SelectItem>
              <SelectItem value="balanced">
                <div className="flex flex-col">
                  <span>平衡模式</span>
                  <span className="text-[10px] text-muted-foreground">地图自动，高风险确认</span>
                </div>
              </SelectItem>
              <SelectItem value="auto">
                <div className="flex flex-col">
                  <span>自动模式</span>
                  <span className="text-[10px] text-muted-foreground">尽量自动执行</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={currentSessionId} disabled={isBusy} onValueChange={onSwitchSession}>
            <SelectTrigger
              size="sm"
              className="order-last h-8 min-w-0 basis-full border-border bg-secondary/80 px-2.5 text-[11px] shadow-inner shadow-black/10"
              title={t('chat.sessionHistory')}
              aria-label={t('chat.sessionHistory')}
            >
              <SelectValue placeholder={t('chat.sessionHistory')} />
            </SelectTrigger>
            <SelectContent align="start" className="w-[var(--radix-select-trigger-width)]">
              {sessions.map((session) => (
                <SelectItem key={session.id} value={session.id} className="max-w-72">
                  <span className="block truncate">{session.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onNewSession}
            disabled={isBusy}
            className="text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title={t('chat.newSession')}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onDeleteSession(currentSessionId)}
            disabled={isBusy || sessions.length <= 1}
            className="text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
            title={t('chat.deleteSession')}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setContextOpen((open) => !open)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground"
            title="上下文状态"
          >
            <Database className="size-3.5" aria-hidden="true" />
          </Button>
          {isBusy && (
            <span
              className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"
              title={statusText}
            >
              <Sparkles className="size-3 animate-pulse" aria-hidden="true" />
              <span className="max-w-24 truncate">{statusText || t('chat.thinking')}</span>
            </span>
          )}
        </header>

        {contextOpen && (
          <div className="shrink-0 border-b border-border bg-muted/25 px-4 py-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground">上下文与记忆</p>
                <p className="mt-1 text-muted-foreground">
                  {sessionStatus
                    ? `${sessionStatus.turnCount} 轮 · ${formatBytes(sessionStatus.estimatedBytes)} · ${
                        sessionStatus.compacted
                          ? `已压缩${sessionStatus.compactionKind ? ` (${sessionStatus.compactionKind})` : ''}`
                          : '未压缩'
                      }`
                    : contextBusy
                      ? '正在读取上下文状态…'
                      : '暂无状态'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={loadContextStatus}
                  disabled={contextBusy}
                >
                  <RefreshCcw className={contextBusy ? 'animate-spin' : ''} aria-hidden="true" />
                  刷新
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    setContextBusy(true)
                    try {
                      await onCompactContext()
                      await loadContextStatus()
                    } finally {
                      setContextBusy(false)
                    }
                  }}
                  disabled={isBusy || contextBusy}
                >
                  压缩上下文
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await onClearContext()
                    await loadContextStatus()
                  }}
                  disabled={isBusy || contextBusy}
                >
                  清空上下文
                </Button>
              </div>
            </div>
            {sessionStatus?.summary ? (
              <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background/80 p-2 text-[11px] leading-relaxed text-muted-foreground">
                {sessionStatus.summary}
              </pre>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground">
                当前会话还没有压缩摘要；对话变长后会按设置自动生成。
              </p>
            )}
          </div>
        )}

        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="gap-6">
            {runs.length === 0 ? (
              <ConversationEmptyState title={t('chat.title')} description={suggestions[0]}>
                <EmptyChatCanvas title={t('chat.title')} description={suggestions[0]} />
              </ConversationEmptyState>
            ) : (
              runs.map((run) => {
                const workflowRunProgress = businessWorkflowRunProgress(run)
                const workflowCompletionSummary = businessWorkflowCompletionSummary(
                  run,
                  sceneAssets,
                )
                return (
                  <section key={run.id} className="space-y-4" aria-label={run.goal}>
                    {runContinuationLabel(run) && (
                      <div className="flex justify-center">
                        <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] text-primary">
                          {runContinuationLabel(run)}
                        </span>
                      </div>
                    )}
                    {workflowRunProgress && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <ListChecks
                            className="size-3.5 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground">
                              业务模板：{workflowRunProgress.title}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              模板进度：{workflowRunProgress.completedTemplateSteps}/
                              {workflowRunProgress.totalTemplateSteps} · 任务计划：
                              {workflowRunProgress.completedPlanSteps}/
                              {workflowRunProgress.totalPlanSteps || '-'}
                            </p>
                          </div>
                          <span className="rounded-full border border-primary/20 bg-background/50 px-2 py-0.5 text-[10px] text-primary">
                            模板执行
                          </span>
                        </div>
                        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                          当前模板步骤 {workflowRunProgress.currentTemplateStepIndex + 1}：
                          {workflowRunProgress.currentTemplateStep}
                        </p>
                        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                          预期成果：{workflowRunProgress.expectedDeliverableText}
                        </p>
                      </div>
                    )}
                    {workflowCompletionSummary && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <CircleCheck
                            className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-300"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground">
                              {workflowCompletionSummary.title} 已完成
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              产物 {workflowCompletionSummary.availableArtifactCount}/
                              {workflowCompletionSummary.artifactCount} · 分析结果{' '}
                              {workflowCompletionSummary.analysisResultCount}
                              {workflowCompletionSummary.pendingReviewCount > 0
                                ? ` · 待复核 ${workflowCompletionSummary.pendingReviewCount}`
                                : workflowCompletionSummary.completedReviewCount > 0
                                  ? ` · 已复核 ${workflowCompletionSummary.completedReviewCount}`
                                  : ''}
                            </p>
                          </div>
                        </div>
                        {workflowCompletionSummary.artifacts.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {workflowCompletionSummary.artifacts.map((artifact) => {
                              const asset = sceneAssets[artifact.ref]
                              return (
                                <Button
                                  key={artifact.ref}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 max-w-full rounded-full border-emerald-500/20 bg-background/45 px-2 text-[10px]"
                                  disabled={!asset}
                                  title={`打开 ${artifact.label}`}
                                  onClick={() => {
                                    if (asset) void onOpenSceneObject(asset)
                                  }}
                                >
                                  <ExternalLink className="size-3" aria-hidden="true" />
                                  <span className="truncate">{artifact.label}</span>
                                </Button>
                              )
                            })}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {workflowCompletionSummary.continueReviewPrompt && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 rounded-full border-amber-500/25 bg-amber-500/5 px-2 text-[10px] text-amber-700 dark:text-amber-200"
                              disabled={isBusy || !canSend}
                              onClick={() =>
                                onSend(workflowCompletionSummary.continueReviewPrompt as string)
                              }
                            >
                              继续复核
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 rounded-full border-emerald-500/20 bg-background/45 px-2 text-[10px]"
                            disabled={isBusy}
                            onClick={() => void onExportDeliverablesPackage()}
                          >
                            <Download className="size-3" aria-hidden="true" />
                            导出成果包
                          </Button>
                        </div>
                      </div>
                    )}
                    <Message from="user">
                      <MessageContent>
                        <span>{run.goal}</span>
                        <UserAttachmentStrip attachments={run.userAttachments} />
                      </MessageContent>
                    </Message>

                    {run.reasoning && (
                      <Reasoning isStreaming={run.reasoning.status === 'streaming'}>
                        <ReasoningTrigger />
                        <ReasoningContent>{run.reasoning.text}</ReasoningContent>
                      </Reasoning>
                    )}

                    <TaskPlanCard
                      run={run}
                      sceneAssets={sceneAssets}
                      onConfirm={onConfirm}
                      onCancel={onCancel}
                      onOpenSceneObject={onOpenSceneObject}
                      onRetryTaskStep={onRetryTaskStep}
                      onSkipTaskStep={onSkipTaskStep}
                      onReplanTaskStep={onReplanTaskStep}
                      highlightedTaskStep={highlightedTaskStep}
                    />

                    {run.tools.map((tool) => (
                      <Tool key={tool.call.id} defaultOpen={tool.status === 'awaiting-approval'}>
                        <ToolHeader
                          type="dynamic-tool"
                          toolName={tool.call.name}
                          title={tool.call.description ?? tool.call.name}
                          state={toolState(tool)}
                        />
                        <ToolContent>
                          <ToolInput input={tool.call.arguments} />
                          <ToolOutput
                            output={tool.result?.data ?? tool.result?.output}
                            errorText={
                              tool.status === 'cancelled' ? undefined : tool.error?.message
                            }
                          />
                          {(() => {
                            const patch = parseSandboxPatchFromTool(tool)
                            return patch ? (
                              <SandboxPatchCard
                                patch={patch}
                                busy={!!applyingSandboxPatchIds[patch.id]}
                                applied={!!appliedSandboxPatchIds[patch.id]}
                                error={sandboxPatchErrors[patch.id]}
                                onApply={() => handleApplySandboxPatch(patch.id)}
                              />
                            ) : null
                          })()}
                          {tool.status === 'awaiting-approval' && (
                            <div className="flex items-center justify-end gap-2 border-t pt-3">
                              <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                                <CircleX aria-hidden="true" />
                                取消
                              </Button>
                              <Button type="button" size="sm" onClick={onConfirm}>
                                <CircleCheck aria-hidden="true" />
                                确认执行
                              </Button>
                            </div>
                          )}
                        </ToolContent>
                      </Tool>
                    ))}

                    {run.messages.map((message) => {
                      const followupSuggestions =
                        message.id === latestCompletedAssistantMessageId
                          ? extractFollowupSuggestions(message.text)
                          : []
                      return (
                        <Message key={message.id} from="assistant">
                          <MessageContent>
                            <MessageResponse
                              clickableSuggestions={followupSuggestions}
                              onSuggestionClick={onSend}
                              suggestionDisabled={isBusy || !canSend}
                            >
                              {message.text}
                            </MessageResponse>
                            {message.streaming && <StreamingOutputIndicator />}
                          </MessageContent>
                        </Message>
                      )
                    })}

                    <RunPendingBubble run={run} />

                    {run.usage && (
                      <p className="text-right text-[10px] text-muted-foreground/70">
                        Tokens: {run.usage.totalTokens}（输入 {run.usage.promptTokens} / 输出{' '}
                        {run.usage.completionTokens}）
                      </p>
                    )}

                    {(() => {
                      const warning = tokenBudgetWarning(run.usage?.totalTokens)
                      return warning ? (
                        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
                          {warning}
                        </div>
                      ) : null
                    })()}

                    {run.status === 'failed' && (
                      <p
                        role="alert"
                        className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                      >
                        {run.error?.message}
                      </p>
                    )}
                  </section>
                )
              })
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="flex max-h-[75%] min-h-0 shrink-0 flex-col gap-2 border-t border-border p-3">
          {showInlineWorkflowTemplates && workflowEntryCards.length > 0 && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-2 border-border bg-muted/20 px-2.5 text-[11px] text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                onClick={() => setWorkflowTemplatesOpen((open) => !open)}
                aria-expanded={workflowTemplatesOpen}
              >
                <ListChecks className="size-3.5 text-primary" aria-hidden="true" />
                <span className="font-medium text-foreground">业务模板</span>
                <span className="rounded-full border border-border bg-background/50 px-1.5 py-0 text-[10px]">
                  {workflowTemplateSummary}
                </span>
                <span className="ml-auto text-[10px]">
                  {workflowTemplatesOpen ? '收起' : '展开'}
                </span>
              </Button>
              {workflowTemplatesOpen && (
                <div className="flex min-h-56 flex-1 flex-col rounded-xl border border-border bg-muted/20 p-2">
                  <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-foreground">业务模板</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        选择一个流程，自动带入已匹配的地图数据和建议工具。
                      </p>
                    </div>
                    <ListChecks className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  </div>
                  <div className="grid min-h-0 flex-1 gap-1.5 overflow-y-auto pr-1">
                    {workflowEntryCards.map((workflow, index) => {
                      const suggestion = workflowSuggestions[index]
                      const currentSelections = workflowAssetSelections[workflow.id] ?? {}
                      const selectedAssetRefs = Object.fromEntries(
                        suggestion.template.requiredAssets.map((requirement) => {
                          const selected =
                            currentSelections[requirement.role] ??
                            suggestion.matchedAssets[requirement.role]?.ref ??
                            '__none__'
                          return [
                            requirement.role,
                            selected === '__none__' ? undefined : selected,
                          ] as const
                        }),
                      )
                      const prompt = buildBusinessWorkflowPromptFromSelectedRefs(
                        suggestion.template,
                        sceneAssets,
                        selectedAssetRefs,
                      )
                      const missingSelectedRoles = suggestion.template.requiredAssets.filter(
                        (requirement) => !selectedAssetRefs[requirement.role],
                      )
                      const canStartWorkflow = missingSelectedRoles.length === 0

                      return (
                        <div
                          key={workflow.id}
                          className={cn(
                            'rounded-lg border p-2 text-left transition-colors',
                            workflowSuggestionClass(workflow.readiness),
                          )}
                          title={workflow.description}
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-[11px] font-semibold">
                                  {workflow.title}
                                </span>
                                <span className="shrink-0 rounded-full border border-current/20 px-1.5 py-0 text-[9px] opacity-85">
                                  {workflow.readinessLabel}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-[10px] leading-4 opacity-80">
                                {workflow.description}
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-1 text-[9px] opacity-80">
                                <span className="rounded-full border border-current/15 px-1.5 py-0.5">
                                  已匹配 {workflow.matchedAssetCount}
                                </span>
                                <span className="rounded-full border border-current/15 px-1.5 py-0.5">
                                  {workflow.missingText}
                                </span>
                                <span className="rounded-full border border-current/15 px-1.5 py-0.5">
                                  工具 {workflow.toolText}
                                </span>
                              </div>
                              <div className="mt-2 grid gap-1">
                                {suggestion.template.requiredAssets.map((requirement) => {
                                  const compatibleAssets = businessWorkflowCompatibleAssets(
                                    sceneAssets,
                                    requirement.geometryType,
                                  )
                                  const value =
                                    currentSelections[requirement.role] ??
                                    suggestion.matchedAssets[requirement.role]?.ref ??
                                    '__none__'
                                  return (
                                    <div
                                      key={requirement.role}
                                      className="grid grid-cols-[3.8rem_minmax(0,1fr)] items-start gap-1"
                                    >
                                      <span className="truncate pt-1.5 text-[9px] opacity-80">
                                        {requirement.role}
                                      </span>
                                      <div className="min-w-0">
                                        <Select
                                          value={value}
                                          disabled={isBusy || compatibleAssets.length === 0}
                                          onValueChange={(assetRef) =>
                                            setWorkflowRoleSelection(
                                              workflow.id,
                                              requirement.role,
                                              assetRef,
                                            )
                                          }
                                        >
                                          <SelectTrigger
                                            size="sm"
                                            className="h-6 min-w-0 border-current/20 bg-background/40 px-2 text-[10px]"
                                            title={requirement.description}
                                          >
                                            <SelectValue placeholder="选择资产" />
                                          </SelectTrigger>
                                          <SelectContent align="start">
                                            <SelectItem value="__none__">尚未选择</SelectItem>
                                            {compatibleAssets.map((asset) => (
                                              <SelectItem key={asset.ref} value={asset.ref}>
                                                <span className="block truncate">
                                                  {asset.name || asset.id}
                                                </span>
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        {compatibleAssets.length === 0 && (
                                          <p className="mt-1 text-[9px] leading-3 text-amber-700/80 dark:text-amber-200/80">
                                            未找到可分析的 {requirement.geometryType} GeoJSON 资产
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              {!canStartWorkflow && (
                                <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[9px] leading-4 text-amber-800/85 dark:text-amber-100/85">
                                  还缺少：{missingSelectedRoles.map((item) => item.role).join('、')}
                                  。 请先在上方选择对应数据资产，或从场景面板导入 GeoJSON/CSV。
                                </p>
                              )}
                              <div className="mt-2 rounded-md border border-current/10 bg-background/25 px-2 py-1.5 text-[9px] opacity-80">
                                <p className="font-medium opacity-90">执行预览</p>
                                <p className="mt-1 line-clamp-2">
                                  流程：{workflow.previewStepText}
                                </p>
                                <p className="mt-0.5">工具：{workflow.toolText}</p>
                                <p className="mt-0.5">成果：{workflow.expectedDeliverableText}</p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0 border-current/20 bg-background/35 px-2 text-[10px]"
                              disabled={isBusy || !canSend || !canStartWorkflow}
                              title={
                                canStartWorkflow
                                  ? workflow.description
                                  : `缺少：${missingSelectedRoles.map((item) => item.role).join('、')}`
                              }
                              onClick={() => onSend(prompt)}
                            >
                              <Sparkles className="size-3" aria-hidden="true" />
                              {canStartWorkflow ? '开始' : '缺数据'}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          <Suggestions>
            {activeSceneObject && (
              <Suggestion
                suggestion={`请操作${sceneObjectReferenceText(activeSceneObject)}`}
                onClick={insertPromptText}
                className="border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"
              >
                操作当前对象
              </Suggestion>
            )}
            {primaryRecentSceneObject && (
              <Suggestion
                suggestion={`请操作${sceneObjectReferenceText(primaryRecentSceneObject, '最近对象')}`}
                onClick={insertPromptText}
                className="border-purple-500/25 bg-purple-500/5 text-purple-700 hover:bg-purple-500/10 dark:text-purple-200"
              >
                操作最近对象
              </Suggestion>
            )}
            {suggestions.map((suggestion) => (
              <Suggestion key={suggestion} suggestion={suggestion} onClick={onSend} />
            ))}
          </Suggestions>
          {activeSceneObject && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/25 px-2.5 py-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                当前对象：
                <span className="font-medium text-foreground">
                  {sceneObjectLabel(activeSceneObject)}
                </span>
                <span className="ml-1 text-muted-foreground/70">{activeSceneObject.ref}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={isBusy || !canSend}
                onClick={insertActiveSceneObjectReference}
              >
                插入引用
              </Button>
            </div>
          )}
          {inputUnavailableMessage && (
            <div
              role="status"
              className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200"
            >
              {inputUnavailableMessage}
            </div>
          )}
          <PromptInput
            accept="image/*"
            maxFiles={4}
            maxFileSize={5 * 1024 * 1024}
            onSubmit={(message, event) => {
              const text = message.text.trim()
              const imageFiles = message.files.filter(isImageAttachment)
              if ((!text && imageFiles.length === 0) || isBusy || !canSend) return
              onSend(text || '请分析这张图片。', imageFiles)
              message.clear()
              event.currentTarget.reset()
            }}
          >
            <ChatImageAttachmentPreview />
            <PromptInputBody>
              <PromptInputTextarea
                ref={promptTextareaRef}
                aria-label="输入任务"
                placeholder="描述你想在地球场景中完成的任务…"
                disabled={isBusy || !canSend}
              />
            </PromptInputBody>
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit
                disabled={!canSend}
                status={isBusy ? 'streaming' : 'ready'}
                onStop={isBusy ? onCancel : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </>
  )
}
