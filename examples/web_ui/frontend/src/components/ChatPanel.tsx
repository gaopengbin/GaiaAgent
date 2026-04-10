import { BotMessageSquare } from 'lucide-react'
import { DisplayItem } from '../types'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { SuggestionChips } from './SuggestionChips'
import { useTranslation } from 'react-i18next'

interface ChatPanelProps {
  items: DisplayItem[]
  isBusy: boolean
  canSend: boolean
  onSend: (text: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export function ChatPanel({ items, isBusy, canSend, onSend, onConfirm, onCancel }: ChatPanelProps) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <BotMessageSquare className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">{t('chat.title')}</span>
        {isBusy && (
          <span className="ml-auto animate-pulse text-[11px] text-muted-foreground">{t('chat.thinking')}</span>
        )}
      </div>
      <MessageList
        items={items}
        onOptionSelect={onSend}
        onConfirmPlan={onConfirm}
        onCancelPlan={onCancel}
      />
      {items.length > 0 && <SuggestionChips onSelect={onSend} />}
      <InputBar onSend={onSend} disabled={isBusy || !canSend} />
    </div>
  )
}
