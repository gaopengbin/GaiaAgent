import { useRef, KeyboardEvent } from 'react'
import { SendHorizonal } from 'lucide-react'
import { Button } from './ui/button'
import { useTranslation } from 'react-i18next'

interface InputBarProps {
  onSend: (text: string) => void
  disabled: boolean
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { t } = useTranslation()

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const text = ref.current?.value.trim() ?? ''
    if (!text || disabled) return
    onSend(text)
    if (ref.current) {
      ref.current.value = ''
      ref.current.style.height = 'auto'
    }
  }

  function autoResize() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div className="flex items-center gap-2 border-t border-border bg-background px-3 py-2">
      <textarea
        ref={ref}
        rows={1}
        placeholder={t('chat.placeholder')}
        disabled={disabled}
        onInput={autoResize}
        onKeyDown={handleKey}
        className="max-h-[100px] flex-1 resize-none rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
      <Button size="icon" className="h-8 w-8 shrink-0" onClick={submit} disabled={disabled}>
        <SendHorizonal className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
