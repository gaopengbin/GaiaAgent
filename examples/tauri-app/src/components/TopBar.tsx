import { useState, useRef, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, Loader2, Sun, Moon, Settings, Languages, Minus, Square, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { ConnStatus } from '../types'
import { useTheme } from '../context/ThemeProvider'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n'



interface TopBarProps {
  agentStatus: ConnStatus
  agentText: string
  bridgeStatus: ConnStatus
  modelLabel?: string
  onOpenSettings?: () => void
}

function StatusDot({ status }: { status: ConnStatus }) {
  const Icon = status === 'connecting' ? Loader2 : status === 'connected' ? Wifi : WifiOff
  return (
    <Icon
      className={cn(
        'h-3.5 w-3.5',
        status === 'connected'    && 'text-emerald-500',
        status === 'connecting'   && 'animate-spin text-amber-500',
        status === 'error'        && 'text-destructive',
        status === 'disconnected' && 'text-muted-foreground',
      )}
    />
  )
}

const iconBtnClass =
  'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

function WindowControls() {
  const handleMinimize = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    getCurrentWindow().minimize()
  }, [])
  const handleMaximize = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    getCurrentWindow().toggleMaximize()
  }, [])
  const handleClose = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    getCurrentWindow().close()
  }, [])

  return (
    <div className="flex items-center h-full">
      <button onClick={handleMinimize} className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted">
        <Minus className="h-4 w-4" />
      </button>
      <button onClick={handleMaximize} className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted">
        <Square className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleClose}
        className="close-btn flex h-full w-12 items-center justify-center text-muted-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function TopBar({ agentStatus, agentText: _agentText, bridgeStatus, modelLabel, onOpenSettings }: TopBarProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!langOpen) return
    const close = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [langOpen])

  return (
    <header className="relative z-[60] flex h-11 shrink-0 items-center border-b border-border bg-card/80 backdrop-blur select-none">
      {/* Drag region */}
      <div className="flex flex-1 items-center gap-3 px-4" data-tauri-drag-region>
        {/* Logo */}
        <img src="/app-icon.png" alt="GaiaAgent" className="h-6 w-6 rounded" />
        <span className="text-sm font-semibold tracking-tight text-foreground">{t('app.name')}</span>
        <span className="hidden text-xs text-muted-foreground sm:block">{t('app.subtitle')}</span>
      </div>

      <div className="flex items-center gap-2 px-3">
        {/* Status indicators */}
        <div className="mr-1.5 flex items-center gap-3">
          <div className="flex items-center gap-1.5" title={t('topbar.bridge')}>
            <StatusDot status={bridgeStatus} />
            <span className="hidden text-xs text-muted-foreground sm:block">{t('topbar.bridge')}</span>
          </div>
          <div className="flex items-center gap-1.5" title={t('topbar.agent')}>
            <StatusDot status={agentStatus} />
            <span className="hidden text-xs text-muted-foreground sm:block">{t('topbar.agent')}</span>
            {modelLabel && (
              <span className="hidden text-[10px] text-muted-foreground/70 sm:block">({modelLabel})</span>
            )}
          </div>
        </div>

        {/* Theme toggle (slider switch) */}
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          title={resolvedTheme === 'dark' ? t('topbar.theme.light') : t('topbar.theme.dark')}
          className="relative flex h-6 w-11 items-center rounded-full border border-border bg-muted/50 transition-colors"
        >
          <Sun className={cn('absolute left-1 h-3.5 w-3.5 z-10 transition-colors', resolvedTheme === 'dark' ? 'text-muted-foreground/40' : 'text-amber-400')} />
          <Moon className={cn('absolute right-1 h-3.5 w-3.5 z-10 transition-colors', resolvedTheme === 'dark' ? 'text-blue-300' : 'text-muted-foreground/40')} />
          <span
            className={cn(
              'absolute h-5 w-5 rounded-full bg-muted-foreground/15 transition-all duration-200',
              resolvedTheme === 'dark' ? 'left-[21px]' : 'left-[1px]',
            )}
          />
        </button>

        {/* Language selector */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen(v => !v)}
            title={t('topbar.language')}
            className={iconBtnClass}
          >
            <Languages className="h-4 w-4" />
          </button>
          {langOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border bg-card py-1 shadow-lg z-50">
              <div className="px-3 py-1.5 text-[11px] text-muted-foreground">{t('topbar.chooseLang')}</div>
              {[
                { code: 'zh', label: '简体中文' },
                { code: 'en', label: 'English' },
              ].map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => { setLanguage(code as 'zh' | 'en'); setLangOpen(false) }}
                  className={cn(
                    'flex w-full items-center px-3 py-1.5 text-xs transition-colors hover:bg-muted',
                    i18n.language === code ? 'text-primary font-medium' : 'text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Settings */}
        {onOpenSettings && (
          <button onClick={onOpenSettings} title={t('settings.title')} className={iconBtnClass}>
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Window controls (Tauri only) */}
      <WindowControls />
    </header>
  )
}
