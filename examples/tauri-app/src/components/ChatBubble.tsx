import { cn, extractNumberedOptions } from '../lib/utils'
import { ChatRole } from '../types'
import { Button } from './ui/button'
import { type ReactNode } from 'react'

/** Lightweight inline-markdown renderer: **bold**, *italic*, `code` */
function renderMarkdownInline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  // Match **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2] != null) {
      // **bold**
      parts.push(<strong key={match.index}>{match[2]}</strong>)
    } else if (match[3] != null) {
      // *italic*
      parts.push(<em key={match.index}>{match[3]}</em>)
    } else if (match[4] != null) {
      // `code`
      parts.push(
        <code key={match.index} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
          {match[4]}
        </code>
      )
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length > 0 ? parts : [text]
}

function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n')
  return lines.map((line, i) => (
    <span key={i}>
      {i > 0 && '\n'}
      {renderMarkdownInline(line)}
    </span>
  ))
}

interface ChatBubbleProps {
  role: ChatRole
  text: string
  onOptionSelect?: (value: string) => void
}

export function ChatBubble({ role, text, onOptionSelect }: ChatBubbleProps) {
  const opts = role === 'agent' ? extractNumberedOptions(text) : []

  // When options are extracted, strip the numbered lines from display text
  // but keep any trailing sentence after '。' that was trimmed from the option label
  const displayText = opts.length >= 2
    ? text.split('\n').map(line => {
        if (!/^\d+[.)]\s+/.test(line)) return line
        const m = line.match(/^(\d+)[.)]\s+(.+)/)
        if (m) {
          const lastPeriod = m[2].lastIndexOf('。')
          if (lastPeriod >= 0 && lastPeriod < m[2].length - 1) {
            return m[2].slice(lastPeriod + 1)
          }
        }
        return ''
      }).filter(l => l !== '').join('\n').trim()
    : text

  if (role === 'system') {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full border border-border bg-card px-3 py-0.5 text-xs text-muted-foreground">
          {text}
        </span>
      </div>
    )
  }

  const isUser  = role === 'user'
  const isError = role === 'error'

  return (
    <div className={cn('flex w-full items-end gap-2 px-1 py-0.5', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          isUser  && 'bg-primary text-primary-foreground',
          !isUser && !isError && 'border border-border bg-secondary text-muted-foreground',
          isError && 'bg-destructive/20 text-destructive',
        )}
      >
        {isUser ? 'U' : isError ? '!' : 'AI'}
      </div>

      <div className={cn('flex min-w-0 max-w-[calc(100%-2.25rem)] flex-1 flex-col gap-1.5', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-xl px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap overflow-hidden break-words',
            isUser  && 'rounded-br-sm bg-primary text-primary-foreground',
            !isUser && !isError && 'rounded-bl-sm border border-border bg-card text-foreground',
            isError && 'rounded-bl-sm border border-destructive/30 bg-destructive/10 text-destructive',
          )}
        >
          {isUser ? text : renderMarkdown(displayText)}
        </div>

        {opts.length >= 2 && (
          <div className="flex flex-wrap gap-1.5">
            {opts.map(o => (
              <Button
                key={o.num}
                variant="outline"
                size="sm"
                onClick={() => onOptionSelect?.(o.label)}
                className="h-auto max-w-full rounded-full border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground text-left whitespace-normal"
              >
                {o.num}. {renderMarkdownInline(o.label)}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
