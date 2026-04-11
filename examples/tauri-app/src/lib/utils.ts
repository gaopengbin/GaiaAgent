import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  return crypto.randomUUID()
}

export function extractNumberedOptions(text: string): { num: string; label: string }[] {
  const lines = text.split(/\n/)
  const opts: { num: string; label: string }[] = []
  for (const line of lines) {
    const m = line.match(/^(\d+)[.)]\s+(.+)/)
    if (m) {
      let label = m[2].trim()
      // If the label contains a trailing sentence after the last '。', trim it off
      const lastPeriod = label.lastIndexOf('。')
      if (lastPeriod >= 0 && lastPeriod < label.length - 1) {
        label = label.slice(0, lastPeriod + 1)
      }
      opts.push({ num: m[1], label })
    }
  }
  if (opts.length < 2) return []
  // Descriptive lists (labels with '：') are informational, not interactive choices
  const descriptive = opts.filter(o => o.label.includes('：')).length
  if (descriptive > opts.length / 2) return []
  return opts
}
