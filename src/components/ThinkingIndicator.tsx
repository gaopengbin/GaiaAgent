import { useState, useEffect, useRef } from 'react'

export function ThinkingIndicator({ text, done }: { text?: string; done?: boolean }) {
  const [elapsed, setElapsed] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (done) return
    const t0 = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [done])

  // Auto-collapse when done
  useEffect(() => {
    if (done) setCollapsed(true)
  }, [done])

  // Auto-scroll thinking text to bottom
  useEffect(() => {
    if (containerRef.current && !collapsed) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [text, collapsed])

  const timeLabel = elapsed > 0 ? `${elapsed}s` : ''

  return (
    <div className="flex w-full items-end gap-2 px-1 py-0.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-muted-foreground">
        AI
      </div>
      <div className="min-w-0 max-w-[calc(100%-2.25rem)] flex-1 rounded-xl rounded-bl-sm border border-border bg-card overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
          onClick={() => text && setCollapsed(c => !c)}
        >
          {!done ? (
            <>
              <span className="h-1.5 w-1.5 animate-[blink_1.2s_ease-in-out_infinite] rounded-full bg-muted-foreground" />
              <span className="h-1.5 w-1.5 animate-[blink_1.2s_ease-in-out_0.2s_infinite] rounded-full bg-muted-foreground" />
              <span className="h-1.5 w-1.5 animate-[blink_1.2s_ease-in-out_0.4s_infinite] rounded-full bg-muted-foreground" />
            </>
          ) : (
            <span className="text-xs text-muted-foreground/70">
              {collapsed ? '\u25B6' : '\u25BC'} 思考过程
            </span>
          )}
          {timeLabel && (
            <span className="ml-1.5 text-[10px] text-muted-foreground/60 tabular-nums">{timeLabel}</span>
          )}
        </button>
        {text && !collapsed && (
          <div
            ref={containerRef}
            className="max-h-48 overflow-y-auto border-t border-border/50 px-3 py-2 text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap break-words font-mono"
          >
            {text}
          </div>
        )}
      </div>
    </div>
  )
}
