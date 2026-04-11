import { useState, useEffect, useCallback } from 'react'
import { X, Server, Cloud, Globe, Bot, Plug, Plus, Play, Square, Trash2, Pencil, FileJson, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'

export interface ModelSettings {
  provider: 'ollama' | 'openai_compat'
  ollamaHost: string
  ollamaModel: string
  openaiBaseUrl: string
  openaiApiKey: string
  openaiModel: string
  cesiumIonToken: string
  tiandituToken: string
  proxyUrl: string
}

export const defaultSettings: ModelSettings = {
  provider: 'ollama',
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:7b',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  cesiumIonToken: '',
  tiandituToken: '',
  proxyUrl: '',
}

type SettingsTab = 'model' | 'general' | 'mcp'

interface McpServerConfig {
  command: string
  args: string[]
  env: Record<string, string>
  enabled?: boolean
}

interface McpConfig {
  servers: Record<string, McpServerConfig>
}

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  settings: ModelSettings
  onSave: (settings: ModelSettings) => void
}

export function SettingsDialog({ open, onClose, settings, onSave }: SettingsDialogProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ModelSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<SettingsTab>('model')

  // MCP state
  const [mcpConfig, setMcpConfig] = useState<McpConfig>({ servers: {} })
  const [mcpRunning, setMcpRunning] = useState<string[]>([])
  const [mcpBusy, setMcpBusy] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [newId, setNewId] = useState('')
  const [newCmd, setNewCmd] = useState('')
  const [newArgs, setNewArgs] = useState('')
  const [newEnv, setNewEnv] = useState('')
  const [mcpError, setMcpError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setDraft(settings); setTab('model') }
  }, [open, settings])

  // Load MCP data when MCP tab is selected
  const loadMcpData = useCallback(async () => {
    try {
      const config = await invoke<McpConfig>('mcp_load_config')
      setMcpConfig(config)
    } catch (e) {
      console.error('Failed to load MCP config:', e)
    }
    try {
      const running = await invoke<string[]>('mcp_list_servers')
      setMcpRunning(running)
    } catch (e) {
      console.error('Failed to list MCP servers:', e)
      setMcpRunning([])
    }
  }, [])

  useEffect(() => {
    if (open && tab === 'mcp') {
      loadMcpData()
    }
  }, [open, tab, loadMcpData])

  // Listen for auto-start events from useTauriAgent init
  useEffect(() => {
    const onStarting = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      setMcpBusy(b => ({ ...b, [id]: true }))
    }
    const onStarted = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      setMcpBusy(b => ({ ...b, [id]: false }))
      // Refresh running list
      invoke<string[]>('mcp_list_servers').then(setMcpRunning).catch(() => {})
    }
    window.addEventListener('mcp-server-starting', onStarting)
    window.addEventListener('mcp-server-started', onStarted)
    return () => {
      window.removeEventListener('mcp-server-starting', onStarting)
      window.removeEventListener('mcp-server-started', onStarted)
    }
  }, [])

  const handleMcpStart = useCallback(async (id: string) => {
    const cfg = mcpConfig.servers[id]
    if (!cfg) return
    setMcpBusy(b => ({ ...b, [id]: true }))
    setMcpError(null)
    try {
      await invoke('mcp_start_server', {
        serverId: id,
        command: cfg.command,
        args: cfg.args,
        env: Object.keys(cfg.env).length > 0 ? cfg.env : null,
      })
      setMcpRunning(r => [...r, id])
      // Persist enabled state
      const updated: McpConfig = {
        servers: { ...mcpConfig.servers, [id]: { ...cfg, enabled: true } },
      }
      await invoke('mcp_save_config', { config: updated }).catch(() => {})
      setMcpConfig(updated)
      window.dispatchEvent(new Event('mcp-tools-changed'))
    } catch (e) {
      setMcpError(`${id}: ${e}`)
    } finally {
      setMcpBusy(b => ({ ...b, [id]: false }))
    }
  }, [mcpConfig])

  const handleMcpStop = useCallback(async (id: string) => {
    setMcpBusy(b => ({ ...b, [id]: true }))
    setMcpError(null)
    try {
      await invoke('mcp_stop_server', { serverId: id })
      setMcpRunning(r => r.filter(x => x !== id))
      // Persist disabled state
      const cfg = mcpConfig.servers[id]
      if (cfg) {
        const updated: McpConfig = {
          servers: { ...mcpConfig.servers, [id]: { ...cfg, enabled: false } },
        }
        await invoke('mcp_save_config', { config: updated }).catch(() => {})
        setMcpConfig(updated)
      }
      window.dispatchEvent(new Event('mcp-tools-changed'))
    } catch (e) {
      setMcpError(`${id}: ${e}`)
    } finally {
      setMcpBusy(b => ({ ...b, [id]: false }))
    }
  }, [mcpConfig])

  const handleMcpAdd = useCallback(async () => {
    const id = newId.trim()
    const cmd = newCmd.trim()
    if (!id || !cmd) return
    if (mcpConfig.servers[id]) {
      setMcpError(`Server ID "${id}" already exists`)
      return
    }
    setMcpError(null)
    const args = newArgs.trim() ? newArgs.trim().split(/\s+/) : []
    const env: Record<string, string> = {}
    for (const line of newEnv.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
      }
    }
    const updated: McpConfig = {
      servers: { ...mcpConfig.servers, [id]: { command: cmd, args, env } },
    }
    try {
      await invoke('mcp_save_config', { config: updated })
      setMcpConfig(updated)
      setAdding(false)
      setNewId('')
      setNewCmd('')
      setNewArgs('')
      setNewEnv('')
    } catch (e) {
      setMcpError(`${e}`)
    }
  }, [newId, newCmd, newArgs, mcpConfig])

  const handleMcpRemove = useCallback(async (id: string) => {
    // Stop first if running
    if (mcpRunning.includes(id)) {
      await invoke('mcp_stop_server', { serverId: id }).catch(() => {})
      setMcpRunning(r => r.filter(x => x !== id))
      window.dispatchEvent(new Event('mcp-tools-changed'))
    }
    const { [id]: _, ...rest } = mcpConfig.servers
    const updated: McpConfig = { servers: rest }
    try {
      await invoke('mcp_save_config', { config: updated })
      setMcpConfig(updated)
    } catch (e) {
      setMcpError(`${e}`)
    }
  }, [mcpConfig, mcpRunning])

  const handleMcpEdit = useCallback((id: string) => {
    const cfg = mcpConfig.servers[id]
    if (!cfg) return
    setEditingId(id)
    setNewCmd(cfg.command)
    setNewArgs(cfg.args.join(' '))
    setNewEnv(Object.entries(cfg.env).map(([k, v]) => `${k}=${v}`).join('\n'))
    setMcpError(null)
  }, [mcpConfig])

  const handleMcpSaveEdit = useCallback(async () => {
    if (!editingId) return
    const cmd = newCmd.trim()
    if (!cmd) return
    setMcpError(null)
    const args = newArgs.trim() ? newArgs.trim().split(/\s+/) : []
    const env: Record<string, string> = {}
    for (const line of newEnv.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    const updated: McpConfig = {
      servers: { ...mcpConfig.servers, [editingId]: { command: cmd, args, env } },
    }
    try {
      await invoke('mcp_save_config', { config: updated })
      setMcpConfig(updated)
      setEditingId(null)
      setNewCmd('')
      setNewArgs('')
      setNewEnv('')
    } catch (e) {
      setMcpError(`${e}`)
    }
  }, [editingId, newCmd, newArgs, newEnv, mcpConfig])

  const handleJsonImport = useCallback(async () => {
    setMcpError(null)
    try {
      const parsed = JSON.parse(jsonText)
      // Support both { mcpServers: {...} } and { servers: {...} } and direct { id: {...} }
      const raw = parsed.mcpServers ?? parsed.servers ?? parsed
      if (typeof raw !== 'object' || raw === null) {
        setMcpError('Invalid JSON: expected an object with server configs')
        return
      }
      const newServers: Record<string, McpServerConfig> = {}
      for (const [id, val] of Object.entries(raw)) {
        const v = val as Record<string, unknown>
        if (typeof v.command !== 'string') continue
        newServers[id] = {
          command: v.command,
          args: Array.isArray(v.args) ? v.args.map(String) : [],
          env: (typeof v.env === 'object' && v.env !== null)
            ? Object.fromEntries(Object.entries(v.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
            : {},
        }
      }
      if (Object.keys(newServers).length === 0) {
        setMcpError('No valid server configs found in JSON')
        return
      }
      const updated: McpConfig = {
        servers: { ...mcpConfig.servers, ...newServers },
      }
      await invoke('mcp_save_config', { config: updated })
      setMcpConfig(updated)
      setAdding(false)
      setJsonMode(false)
      setJsonText('')
    } catch (e) {
      if (e instanceof SyntaxError) {
        setMcpError('Invalid JSON syntax')
      } else {
        setMcpError(`${e}`)
      }
    }
  }, [jsonText, mcpConfig])

  const cancelForm = useCallback(() => {
    setAdding(false)
    setEditingId(null)
    setJsonMode(false)
    setNewId('')
    setNewCmd('')
    setNewArgs('')
    setNewEnv('')
    setJsonText('')
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave(draft)
      onClose()
    } finally {
      setSaving(false)
    }
  }, [draft, onSave, onClose])

  if (!open) return null

  const isOllama = draft.provider === 'ollama'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">{t('settings.title')}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border px-5">
          <TabButton active={tab === 'model'} icon={<Bot className="h-3.5 w-3.5" />} label={t('settings.tabModel')} onClick={() => setTab('model')} />
          <TabButton active={tab === 'mcp'} icon={<Plug className="h-3.5 w-3.5" />} label={t('settings.tabMcp')} onClick={() => setTab('mcp')} />
          <TabButton active={tab === 'general'} icon={<Globe className="h-3.5 w-3.5" />} label={t('settings.tabGeneral')} onClick={() => setTab('general')} />
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4 max-h-[60vh] overflow-y-auto">
          {tab === 'model' ? (
            <>
              {/* Provider selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">{t('settings.providerLabel')}</label>
                <div className="flex gap-2">
                  <ProviderTab
                    active={isOllama}
                    icon={<Server className="h-4 w-4" />}
                    label="Ollama"
                    onClick={() => setDraft(d => ({ ...d, provider: 'ollama' }))}
                  />
                  <ProviderTab
                    active={!isOllama}
                    icon={<Cloud className="h-4 w-4" />}
                    label={t('settings.openaiCompat')}
                    onClick={() => setDraft(d => ({ ...d, provider: 'openai_compat' }))}
                  />
                </div>
              </div>

              {/* Provider-specific fields */}
              {isOllama ? (
                <div className="space-y-3">
                  <Field
                    label={t('settings.ollamaHost')}
                    value={draft.ollamaHost}
                    placeholder="http://localhost:11434"
                    onChange={v => setDraft(d => ({ ...d, ollamaHost: v }))}
                  />
                  <Field
                    label={t('settings.modelName')}
                    value={draft.ollamaModel}
                    placeholder="qwen2.5:7b"
                    onChange={v => setDraft(d => ({ ...d, ollamaModel: v }))}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <Field
                    label={t('settings.baseUrl')}
                    value={draft.openaiBaseUrl}
                    placeholder="https://api.openai.com/v1"
                    onChange={v => setDraft(d => ({ ...d, openaiBaseUrl: v }))}
                  />
                  <Field
                    label="API Key"
                    value={draft.openaiApiKey}
                    placeholder="sk-..."
                    type="password"
                    onChange={v => setDraft(d => ({ ...d, openaiApiKey: v }))}
                  />
                  <Field
                    label={t('settings.modelName')}
                    value={draft.openaiModel}
                    placeholder="gpt-4o-mini"
                    onChange={v => setDraft(d => ({ ...d, openaiModel: v }))}
                  />
                </div>
              )}
            </>
          ) : tab === 'mcp' ? (
            <div className="space-y-3">
              {/* Error display */}
              {mcpError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                  {mcpError}
                </div>
              )}
              {/* Server list */}
              {Object.keys(mcpConfig.servers).length === 0 && !adding && (
                <p className="text-xs text-muted-foreground text-center py-4">{t('settings.mcpEmpty')}</p>
              )}
              {Object.entries(mcpConfig.servers).map(([id, cfg]) => {
                const isRunning = mcpRunning.includes(id)
                const busy = mcpBusy[id] ?? false
                const isEditing = editingId === id

                if (isEditing) {
                  return (
                    <div key={id} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 space-y-2.5">
                      <div className="text-xs font-semibold text-foreground">{id}</div>
                      <Field label={t('settings.mcpCommand')} value={newCmd} placeholder="npx" onChange={setNewCmd} />
                      <Field label={t('settings.mcpArgs')} value={newArgs} placeholder="--yes @scope/mcp-server" onChange={setNewArgs} />
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t('settings.mcpEnv')}</label>
                        <textarea
                          value={newEnv}
                          placeholder={"KEY=value\nANOTHER_KEY=value"}
                          onChange={e => setNewEnv(e.target.value)}
                          rows={2}
                          className="w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 font-mono resize-none"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={cancelForm} className="h-7 text-[11px]">
                          {t('settings.cancel')}
                        </Button>
                        <Button size="sm" onClick={handleMcpSaveEdit} disabled={!newCmd.trim()} className="h-7 text-[11px]">
                          {t('settings.save')}
                        </Button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={id} className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{id}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          busy ? 'bg-yellow/15 text-yellow'
                          : isRunning ? 'bg-green/15 text-green'
                          : 'bg-muted text-muted-foreground'
                        }`}>
                          {busy ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-green' : 'bg-muted-foreground/50'}`} />
                          )}
                          {busy ? t('settings.mcpStarting') : isRunning ? t('settings.mcpRunning') : t('settings.mcpStopped')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMcpEdit(id)}
                          disabled={busy}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                          title={t('settings.mcpEdit')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {isRunning ? (
                          <button
                            onClick={() => handleMcpStop(id)}
                            disabled={busy}
                            className="rounded p-1 text-red hover:bg-red/10 transition-colors disabled:opacity-50"
                            title={t('settings.mcpStop')}
                          >
                            <Square className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleMcpStart(id)}
                            disabled={busy}
                            className="rounded p-1 text-green hover:bg-green/10 transition-colors disabled:opacity-50"
                            title={t('settings.mcpStart')}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleMcpRemove(id)}
                          disabled={busy}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors disabled:opacity-50"
                          title={t('settings.mcpRemove')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {cfg.command} {cfg.args.join(' ')}
                    </p>
                    {Object.keys(cfg.env).length > 0 && (
                      <p className="text-[10px] text-muted-foreground/60 font-mono truncate">
                        env: {Object.keys(cfg.env).join(', ')}
                      </p>
                    )}
                  </div>
                )
              })}

              {/* Add / JSON import form */}
              {adding ? (
                jsonMode ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 space-y-2.5">
                    <label className="text-xs font-medium text-foreground">{t('settings.mcpJsonImport')}</label>
                    <textarea
                      value={jsonText}
                      placeholder={'{\n  "mcpServers": {\n    "server-id": {\n      "command": "npx",\n      "args": ["-y", "@scope/pkg"],\n      "env": { "KEY": "value" }\n    }\n  }\n}'}
                      onChange={e => setJsonText(e.target.value)}
                      rows={8}
                      className="w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 font-mono resize-none"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="ghost" size="sm" onClick={cancelForm} className="h-7 text-[11px]">
                        {t('settings.cancel')}
                      </Button>
                      <Button size="sm" onClick={handleJsonImport} disabled={!jsonText.trim()} className="h-7 text-[11px]">
                        {t('settings.mcpImport')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 space-y-2.5">
                    <Field label={t('settings.mcpServerId')} value={newId} placeholder="my-server" onChange={setNewId} />
                    <Field label={t('settings.mcpCommand')} value={newCmd} placeholder="npx" onChange={setNewCmd} />
                    <Field label={t('settings.mcpArgs')} value={newArgs} placeholder="--yes @scope/mcp-server" onChange={setNewArgs} />
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">{t('settings.mcpEnv')}</label>
                      <textarea
                        value={newEnv}
                        placeholder={"KEY=value\nANOTHER_KEY=value"}
                        onChange={e => setNewEnv(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 font-mono resize-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="ghost" size="sm" onClick={cancelForm} className="h-7 text-[11px]">
                        {t('settings.cancel')}
                      </Button>
                      <Button size="sm" onClick={handleMcpAdd} disabled={!newId.trim() || !newCmd.trim()} className="h-7 text-[11px]">
                        {t('settings.mcpAdd')}
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAdding(true); setJsonMode(false) }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('settings.mcpAdd')}
                  </button>
                  <button
                    onClick={() => { setAdding(true); setJsonMode(true) }}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    title={t('settings.mcpJsonImport')}
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    JSON
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Field
                label={t('settings.cesiumIonToken')}
                value={draft.cesiumIonToken}
                placeholder="eyJhbGciOi..."
                type="password"
                onChange={v => setDraft(d => ({ ...d, cesiumIonToken: v }))}
              />
              <p className="text-[10px] text-muted-foreground/70">{t('settings.cesiumIonTokenHint')}</p>
              <Field
                label={t('settings.tiandituToken')}
                value={draft.tiandituToken}
                placeholder="your-tianditu-key"
                type="password"
                onChange={v => setDraft(d => ({ ...d, tiandituToken: v }))}
              />
              <p className="text-[10px] text-muted-foreground/70">{t('settings.tiandituTokenHint')}</p>
              <Field
                label={t('settings.proxyUrl')}
                value={draft.proxyUrl}
                placeholder="http://127.0.0.1:10808"
                onChange={v => setDraft(d => ({ ...d, proxyUrl: v }))}
              />
              <p className="text-[10px] text-muted-foreground/70">{t('settings.proxyUrlHint')}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
            {tab === 'mcp' ? t('settings.cancel') : t('settings.cancel')}
          </Button>
          {tab !== 'mcp' && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs">
              {saving ? t('settings.saving') : t('settings.save')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ProviderTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function Field({
  label,
  value,
  placeholder,
  type = 'text',
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  type?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
    </div>
  )
}
