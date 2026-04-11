import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'

interface SuggestionChipsProps {
  onSelect: (text: string) => void
}

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  const { t } = useTranslation()
  const suggestions = t('suggestions', { returnObjects: true }) as string[]

  return (
    <div className="flex flex-wrap gap-1 border-t border-border px-3 py-2">
      {suggestions.map(s => (
        <Button
          key={s}
          variant="outline"
          size="sm"
          onClick={() => onSelect(s)}
          className="h-6 rounded-full px-2.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
        >
          {s}
        </Button>
      ))}
    </div>
  )
}
