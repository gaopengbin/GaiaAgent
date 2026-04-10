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
    if (m) opts.push({ num: m[1], label: m[2].trim() })
  }
  return opts.length >= 2 ? opts : []
}
