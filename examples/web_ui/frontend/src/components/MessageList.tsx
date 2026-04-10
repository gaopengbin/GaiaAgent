import { useEffect, useRef } from 'react'
import { Globe } from 'lucide-react'
import { DisplayItem } from '../types'
import { ChatBubble } from './ChatBubble'
import { PlanCard } from './PlanCard'
import { ThinkingIndicator } from './ThinkingIndicator'
import { ScrollArea } from './ui/scroll-area'
import { useTranslation } from 'react-i18next'

interface MessageListProps {
  items: DisplayItem[]
  onOptionSelect: (value: string) => void
  onConfirmPlan: () => void
  onCancelPlan: () => void
}

export function MessageList({ items, onOptionSelect, onConfirmPlan, onCancelPlan }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items])

  if (items.length === 0) {
    const suggestions = t('suggestions', { returnObjects: true }) as string[]
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Globe className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t('chat.emptyTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('chat.emptyHint')}</p>
        </div>
        <div className="flex flex-col gap-1.5 w-full max-w-[260px] mt-2">
          {suggestions.map(s => (
            <button
              key={s}
              onClick={() => onOptionSelect(s)}
              className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground text-left"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-1.5 px-3 py-3">
        {items.map(item => {
          if (item.kind === 'thinking') {
            return <ThinkingIndicator key={item.id} text={item.text} done={item.done} />
          }
          if (item.kind === 'plan') {
            return (
              <PlanCard
                key={item.id}
                goal={item.goal}
                steps={item.steps}
                confirmed={item.confirmed}
                onConfirm={onConfirmPlan}
                onCancel={onCancelPlan}
              />
            )
          }
          return (
            <ChatBubble
              key={item.id}
              role={item.role}
              text={item.text}
              onOptionSelect={onOptionSelect}
            />
          )
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
