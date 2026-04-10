import { useState } from 'react'
import { CheckCircle2, XCircle, Loader2, Circle, Check, X, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { cn } from '../lib/utils'
import { PlanStep, StepStatus, StepResult } from '../types'
import { Button } from './ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { useTranslation } from 'react-i18next'

interface PlanCardProps {
  goal: string
  steps: PlanStep[]
  confirmed: boolean
  onConfirm: () => void
  onCancel: () => void
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
  if (status === 'done')    return <CheckCircle2 className="h-3.5 w-3.5 text-green" />
  if (status === 'failed')  return <XCircle className="h-3.5 w-3.5 text-destructive" />
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" />
}

function useStatusBadge() {
  const { t } = useTranslation()
  return {
    pending: { label: t('plan.pending'), variant: 'secondary'    as const },
    running: { label: t('plan.running'), variant: 'default'      as const },
    done:    { label: t('plan.done'),    variant: 'secondary'    as const },
    failed:  { label: t('plan.failed'),  variant: 'destructive'  as const },
  }
}

function StepResultView({ result }: { result: StepResult }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  if (result.image) {
    const src = `data:${result.mediaType ?? 'image/png'};base64,${result.image}`
    return (
      <img
        src={src}
        alt="screenshot"
        className="mt-1.5 max-h-48 w-full rounded border border-border/40 object-contain"
      />
    )
  }
  if (!result.output) return null

  const raw = result.output

  // --- Try to detect structured data (layers, entities, etc.) ---
  const lines = raw.split('\n').filter(Boolean)
  const parsedItems: Record<string, unknown>[] = []
  const textLines: string[] = []

  for (const line of lines) {
    try {
      const obj = JSON.parse(line)
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        parsedItems.push(obj as Record<string, unknown>)
      } else {
        textLines.push(line)
      }
    } catch {
      textLines.push(line)
    }
  }

  // Detect layer/entity-like items (have id + name or type)
  const isStructured = parsedItems.length > 0 &&
    parsedItems.every(item => 'id' in item && ('name' in item || 'type' in item))

  if (isStructured) {
    return (
      <div className="mt-1.5">
        {textLines.length > 0 && (
          <p className="text-[11px] text-muted-foreground mb-1">{textLines.join(' ')}</p>
        )}
        <div className="rounded-md border border-border/40 bg-muted/30 overflow-hidden divide-y divide-border/30">
          {parsedItems.map((item, i) => {
            const name = String(item.name ?? item.id ?? `#${i + 1}`)
            const type = item.type as string | undefined
            const visible = item.visible as boolean | undefined
            const color = item.color as string | undefined
            return (
              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                {color && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border/50"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span className="flex-1 truncate text-foreground/90">{name}</span>
                {type && (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground">{type}</span>
                )}
                {visible !== undefined && (
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', visible ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // --- Fallback: text/JSON display ---
  const TRUNCATE = 200
  let display = raw
  let isJson = false
  try {
    const parsed = JSON.parse(raw)
    display = JSON.stringify(parsed, null, 2)
    isJson = true
  } catch {
    let jsonCount = 0
    const formatted = lines.map(l => {
      try {
        const parsed = JSON.parse(l)
        jsonCount++
        return JSON.stringify(parsed, null, 2)
      } catch {
        return l
      }
    })
    if (jsonCount > 0) {
      display = formatted.join('\n')
      isJson = true
    }
  }

  const isLong = display.length > TRUNCATE
  const showText = expanded || !isLong ? display : display.slice(0, TRUNCATE)

  const handleCopy = () => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="mt-1.5 group/result">
      <div className="relative">
        <pre
          className={cn(
            'rounded-md bg-muted/60 px-2.5 py-2 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all text-muted-foreground overflow-hidden',
            !expanded && isLong && 'max-h-[5rem]',
          )}
        >
          {showText}
        </pre>
        {!expanded && isLong && (
          <div className="absolute inset-x-0 bottom-0 h-8 rounded-b-md bg-gradient-to-t from-muted/90 to-transparent pointer-events-none" />
        )}
        <button
          onClick={handleCopy}
          className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground/50 opacity-0 group-hover/result:opacity-100 hover:text-foreground hover:bg-muted transition-all"
          title="Copy"
        >
          <Copy className={cn('h-3 w-3', copied && 'text-green-500')} />
        </button>
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 mt-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? '收起' : `展开 (${raw.length} 字符${isJson ? ', JSON' : ''})`}
        </button>
      )}
    </div>
  )
}

function StepRow({ step }: { step: PlanStep }) {
  const STATUS_BADGE = useStatusBadge()
  const badge = STATUS_BADGE[step.status]
  return (
    <div
      className={cn(
        'flex flex-col rounded-md border px-2.5 py-2 text-xs transition-colors',
        step.status === 'pending' && 'border-border/50 bg-card/40',
        step.status === 'running' && 'border-primary/30 bg-primary/5',
        step.status === 'done'    && 'border-green/25 bg-green/5',
        step.status === 'failed'  && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0"><StepIcon status={step.status} /></div>
        <div className="min-w-0 flex-1">
          <p className="leading-snug text-sm text-foreground break-all">{step.description}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground break-all">{step.tool}</p>
          {step.error && <p className="mt-1 text-xs text-destructive break-all">{step.error}</p>}
        </div>
        <Badge variant={badge.variant} className="ml-auto shrink-0 text-[9px]">{badge.label}</Badge>
      </div>
      {step.result && step.status === 'done' && <StepResultView result={step.result} />}
    </div>
  )
}

export function PlanCard({ goal, steps, confirmed, onConfirm, onCancel }: PlanCardProps) {
  const { t } = useTranslation()
  return (
    <div className="flex w-full items-end gap-2 px-1 py-0.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-muted-foreground">
        AI
      </div>

      <Card className="min-w-0 max-w-[calc(100%-2.25rem)] flex-1 border-border bg-card shadow-sm">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-foreground min-w-0">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="break-all">{goal}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-1.5 pb-2">
          {steps.map(s => <StepRow key={s.id} step={s} />)}
        </CardContent>

        {!confirmed && (
          <>
            <Separator />
            <CardFooter className="gap-2 pt-3">
              <Button size="sm" className="flex-1 gap-1.5" onClick={onConfirm}>
                <Check className="h-3.5 w-3.5" /> {t('plan.confirm')}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onCancel}>
                <X className="h-3.5 w-3.5" /> {t('plan.cancel')}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  )
}
