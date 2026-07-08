import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Server,
  Cloud,
  Globe,
  Bot,
  Plug,
  Plus,
  Play,
  Square,
  Trash2,
  Pencil,
  FileJson,
  Loader2,
  Activity,
  Download,
  RefreshCw,
} from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { defaultSettings, type ModelSettings } from './settings-model'

const CCSWITCH_BASE_URL = 'http://127.0.0.1:15721/v1'
const CCSWITCH_CODEX_DEFAULT_MODEL = 'gpt-5'
const CCSWITCH_CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-6'

type SettingsTab = 'model' | 'general' | 'mcp' | 'diagnostics'

interface McpServerConfig {
  command?: string
  args: string[]
  env: Record<string, string>
  enabled?: boolean
  transport?: 'stdio' | 'streamable-http'
  url?: string
  auth?: 'none' | 'oauth'
  oauthScopes?: string[]
}

interface McpConfig {
  servers: Record<string, McpServerConfig>
}

interface McpServerStatus {
  id: string
  state: 'connected' | 'disconnected'
  transport: 'stdio' | 'streamable-http'
  toolCount: number
  connectedAtMs: number
}

interface TraceSessionSummary {
  runId: string
  goal: string
  status: 'running' | 'completed' | 'cancelled' | 'failed'
  provider?: string | null
  runtime?: string | null
  startedAt: number
  completedAt?: number | null
  promptTokens: number
  completionTokens: number
  eventCount: number
  error?: string | null
}

interface CcSwitchHealth {
  reachable: boolean
  baseUrl: string
  codexProxyEnabled: boolean
  claudeProxyEnabled: boolean
  currentCodexProvider?: string | null
  currentCodexHasBaseUrl: boolean
  currentClaudeProvider?: string | null
  currentClaudeHasBaseUrl: boolean
  message: string
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
  const [mcpStatuses, setMcpStatuses] = useState<Record<string, McpServerStatus>>({})
  const [mcpBusy, setMcpBusy] = useState<Record<string, boolean>>({})
  const [mcpStartTimes, setMcpStartTimes] = useState<Record<string, number>>({})
  const [mcpFailures, setMcpFailures] = useState<Record<string, string>>({})
  const [mcpClock, setMcpClock] = useState(() => Date.now())
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [newId, setNewId] = useState('')
  const [newTransport, setNewTransport] = useState<'stdio' | 'streamable-http'>('stdio')
  const [newAuth, setNewAuth] = useState<'none' | 'oauth'>('none')
  const [newScopes, setNewScopes] = useState('')
  const [newCmd, setNewCmd] = useState('')
  const [newArgs, setNewArgs] = useState('')
  const [newEnv, setNewEnv] = useState('')
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [oauthFlow, setOauthFlow] = useState<{
    serverId: string
    authorizationUrl: string
    redirectUri: string
    callbackUrl: string
  } | null>(null)
  const [traceSessions, setTraceSessions] = useState<TraceSessionSummary[]>([])
  const [traceEvents, setTraceEvents] = useState<Record<string, unknown>[]>([])
  const [selectedTraceRunId, setSelectedTraceRunId] = useState<string | null>(null)
  const selectedTraceRunIdRef = useRef<string | null>(null)
  const [traceBusy, setTraceBusy] = useState(false)
  const [traceError, setTraceError] = useState<string | null>(null)
  const [traceExportPath, setTraceExportPath] = useState<string | null>(null)
  const [ccHealth, setCcHealth] = useState<CcSwitchHealth | null>(null)
  const [ccHealthBusy, setCcHealthBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(settings)
      setTab('model')
    }
  }, [open, settings])

  useEffect(() => {
    selectedTraceRunIdRef.current = selectedTraceRunId
  }, [selectedTraceRunId])

  const loadTraceSessions = useCallback(async () => {
    setTraceBusy(true)
    setTraceError(null)
    try {
      const sessions = await invoke<TraceSessionSummary[]>('trace_list_sessions', { limit: 50 })
      setTraceSessions(sessions)
      const nextRunId = selectedTraceRunIdRef.current ?? sessions[0]?.runId ?? null
      setSelectedTraceRunId(nextRunId)
      if (nextRunId) {
        const events = await invoke<Record<string, unknown>[]>('trace_get_events', {
          runId: nextRunId,
        })
        setTraceEvents(events)
      } else {
        setTraceEvents([])
      }
    } catch (error) {
      setTraceError(String(error))
    } finally {
      setTraceBusy(false)
    }
  }, [])

  const loadTraceEvents = useCallback(async (runId: string) => {
    setSelectedTraceRunId(runId)
    setTraceBusy(true)
    setTraceError(null)
    try {
      const events = await invoke<Record<string, unknown>[]>('trace_get_events', { runId })
      setTraceEvents(events)
    } catch (error) {
      setTraceError(String(error))
    } finally {
      setTraceBusy(false)
    }
  }, [])

  const exportDiagnostics = useCallback(async (runId?: string | null) => {
    setTraceBusy(true)
    setTraceError(null)
    try {
      const path = await invoke<string>('trace_export_diagnostics', { runId: runId ?? null })
      setTraceExportPath(path)
    } catch (error) {
      setTraceError(String(error))
    } finally {
      setTraceBusy(false)
    }
  }, [])

  const checkCcSwitchHealth = useCallback(async () => {
    setCcHealthBusy(true)
    try {
      const result = await invoke<CcSwitchHealth>('cc_switch_health_check')
      setCcHealth(result)
    } catch (error) {
      setCcHealth({
        reachable: false,
        baseUrl: CCSWITCH_BASE_URL,
        codexProxyEnabled: false,
        claudeProxyEnabled: false,
        currentCodexProvider: null,
        currentCodexHasBaseUrl: false,
        currentClaudeProvider: null,
        currentClaudeHasBaseUrl: false,
        message: String(error),
      })
    } finally {
      setCcHealthBusy(false)
    }
  }, [])

  useEffect(() => {
    if (open && tab === 'diagnostics') void loadTraceSessions()
  }, [open, tab, loadTraceSessions])

  // Load MCP data when MCP tab is selected
  const loadMcpData = useCallback(async () => {
    try {
      const config = await invoke<McpConfig>('mcp_load_config')
      setMcpConfig(config)
    } catch (e) {
      console.error('Failed to load MCP config:', e)
    }
    try {
      const statuses = await invoke<McpServerStatus[]>('mcp_server_statuses')
      setMcpStatuses(Object.fromEntries(statuses.map((status) => [status.id, status])))
      const connectedIds = new Set(
        statuses.filter((status) => status.state === 'connected').map((status) => status.id),
      )
      setMcpFailures((failures) => {
        const next = { ...failures }
        for (const id of connectedIds) delete next[id]
        return next
      })
      setMcpRunning(
        statuses.filter((status) => status.state === 'connected').map((status) => status.id),
      )
    } catch (e) {
      console.error('Failed to list MCP servers:', e)
      setMcpRunning([])
    }
  }, [])

  useEffect(() => {
    if (open && tab === 'mcp') {
      loadMcpData()
      const interval = window.setInterval(() => void loadMcpData(), 5000)
      return () => window.clearInterval(interval)
    }
  }, [open, tab, loadMcpData])

  useEffect(() => {
    let disposed = false
    const unlisten = listen<string>('mcp-tools-changed', () => {
      if (!disposed) void loadMcpData()
    }).catch(() => undefined)
    return () => {
      disposed = true
      void unlisten.then((dispose) => dispose?.())
    }
  }, [loadMcpData])

  useEffect(() => {
    if (!Object.values(mcpBusy).some(Boolean)) return undefined
    const interval = window.setInterval(() => setMcpClock(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [mcpBusy])

  // Listen for auto-start events from useTauriAgent init
  useEffect(() => {
    const onStarting = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      setMcpBusy((b) => ({ ...b, [id]: true }))
      setMcpStartTimes((times) => ({ ...times, [id]: Date.now() }))
      setMcpFailures((failures) => {
        const { [id]: _removed, ...rest } = failures
        return rest
      })
    }
    const onFailed = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; error: string }>).detail
      if (!detail?.id) return
      setMcpBusy((b) => ({ ...b, [detail.id]: false }))
      setMcpFailures((failures) => ({ ...failures, [detail.id]: detail.error }))
    }
    const onStarted = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      setMcpBusy((b) => ({ ...b, [id]: false }))
      setMcpStartTimes((times) => {
        const { [id]: _removed, ...rest } = times
        return rest
      })
      // Refresh running list
      void loadMcpData()
    }
    window.addEventListener('mcp-server-starting', onStarting)
    window.addEventListener('mcp-server-failed', onFailed)
    window.addEventListener('mcp-server-started', onStarted)
    return () => {
      window.removeEventListener('mcp-server-starting', onStarting)
      window.removeEventListener('mcp-server-failed', onFailed)
      window.removeEventListener('mcp-server-started', onStarted)
    }
  }, [loadMcpData])

  const handleMcpStart = useCallback(
    async (id: string) => {
      const cfg = mcpConfig.servers[id]
      if (!cfg) return
      setMcpBusy((b) => ({ ...b, [id]: true }))
      setMcpStartTimes((times) => ({ ...times, [id]: Date.now() }))
      setMcpFailures((failures) => {
        const { [id]: _removed, ...rest } = failures
        return rest
      })
      setMcpError(null)
      try {
        if (cfg.transport === 'streamable-http' && cfg.url) {
          await invoke(cfg.auth === 'oauth' ? 'mcp_connect_remote_oauth' : 'mcp_connect_remote', {
            serverId: id,
            url: cfg.url,
          })
        } else {
          await invoke('mcp_start_server', {
            serverId: id,
            command: cfg.command,
            args: cfg.args,
            env: Object.keys(cfg.env).length > 0 ? cfg.env : null,
          })
        }
        setMcpRunning((r) => [...r, id])
        // Persist enabled state
        const updated: McpConfig = {
          servers: { ...mcpConfig.servers, [id]: { ...cfg, enabled: true } },
        }
        await invoke('mcp_save_config', { config: updated }).catch(() => {})
        setMcpConfig(updated)
        window.dispatchEvent(new Event('mcp-tools-changed'))
      } catch (e) {
        const message = String(e)
        setMcpFailures((failures) => ({ ...failures, [id]: message }))
        setMcpError(`${id}: ${message}`)
      } finally {
        setMcpBusy((b) => ({ ...b, [id]: false }))
        setMcpStartTimes((times) => {
          const { [id]: _removed, ...rest } = times
          return rest
        })
      }
    },
    [mcpConfig],
  )

  const handleMcpStop = useCallback(
    async (id: string) => {
      setMcpBusy((b) => ({ ...b, [id]: true }))
      setMcpFailures((failures) => {
        const { [id]: _removed, ...rest } = failures
        return rest
      })
      setMcpError(null)
      try {
        await invoke('mcp_stop_server', { serverId: id })
        setMcpRunning((r) => r.filter((x) => x !== id))
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
        setMcpBusy((b) => ({ ...b, [id]: false }))
      }
    },
    [mcpConfig],
  )

  const handleOAuthStart = useCallback(async (id: string, config: McpServerConfig) => {
    if (!config.url) return
    setMcpError(null)
    setMcpBusy((busy) => ({ ...busy, [id]: true }))
    try {
      const result = await invoke<{ authorizationUrl: string; redirectUri: string }>(
        'mcp_oauth_start',
        {
          serverId: id,
          url: config.url,
          scopes: config.oauthScopes ?? [],
        },
      )
      setOauthFlow({ serverId: id, ...result, callbackUrl: '' })
    } catch (error) {
      setMcpError(`${id}: ${error}`)
    } finally {
      setMcpBusy((busy) => ({ ...busy, [id]: false }))
    }
  }, [])

  const handleOAuthComplete = useCallback(async () => {
    if (!oauthFlow?.callbackUrl.trim()) return
    setMcpError(null)
    try {
      await invoke('mcp_oauth_complete', {
        serverId: oauthFlow.serverId,
        callbackUrl: oauthFlow.callbackUrl.trim(),
      })
      setOauthFlow(null)
    } catch (error) {
      setMcpError(`${oauthFlow.serverId}: ${error}`)
    }
  }, [oauthFlow])

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
    const server: McpServerConfig =
      newTransport === 'streamable-http'
        ? {
            transport: 'streamable-http',
            url: cmd,
            auth: newAuth,
            oauthScopes: newScopes.trim() ? newScopes.trim().split(/\s+/) : [],
            args: [],
            env: {},
          }
        : { transport: 'stdio', command: cmd, args, env }
    const updated: McpConfig = { servers: { ...mcpConfig.servers, [id]: server } }
    try {
      await invoke('mcp_save_config', { config: updated })
      setMcpConfig(updated)
      setAdding(false)
      setNewId('')
      setNewTransport('stdio')
      setNewAuth('none')
      setNewScopes('')
      setNewCmd('')
      setNewArgs('')
      setNewEnv('')
    } catch (e) {
      setMcpError(`${e}`)
    }
  }, [newId, newTransport, newAuth, newScopes, newCmd, newArgs, newEnv, mcpConfig])

  const handleMcpRemove = useCallback(
    async (id: string) => {
      // Stop first if running
      if (mcpRunning.includes(id)) {
        await invoke('mcp_stop_server', { serverId: id }).catch(() => {})
        setMcpRunning((r) => r.filter((x) => x !== id))
        window.dispatchEvent(new Event('mcp-tools-changed'))
      }
      const { [id]: _, ...rest } = mcpConfig.servers
      const removed = mcpConfig.servers[id]
      if (removed?.auth === 'oauth' && removed.url) {
        await invoke('mcp_oauth_clear', { serverId: id, url: removed.url }).catch(() => {})
      }
      const updated: McpConfig = { servers: rest }
      try {
        await invoke('mcp_save_config', { config: updated })
        setMcpConfig(updated)
      } catch (e) {
        setMcpError(`${e}`)
      }
    },
    [mcpConfig, mcpRunning],
  )

  const handleMcpEdit = useCallback(
    (id: string) => {
      const cfg = mcpConfig.servers[id]
      if (!cfg) return
      setEditingId(id)
      setNewTransport(cfg.transport === 'streamable-http' ? 'streamable-http' : 'stdio')
      setNewAuth(cfg.auth === 'oauth' ? 'oauth' : 'none')
      setNewScopes((cfg.oauthScopes ?? []).join(' '))
      setNewCmd(cfg.transport === 'streamable-http' ? (cfg.url ?? '') : (cfg.command ?? ''))
      setNewArgs(cfg.args.join(' '))
      setNewEnv(
        Object.entries(cfg.env)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      )
      setMcpError(null)
    },
    [mcpConfig],
  )

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
    const current = mcpConfig.servers[editingId]
    const server: McpServerConfig =
      newTransport === 'streamable-http'
        ? {
            transport: 'streamable-http',
            url: cmd,
            auth: newAuth,
            oauthScopes: newScopes.trim() ? newScopes.trim().split(/\s+/) : [],
            args: [],
            env: {},
            enabled: current?.enabled,
          }
        : { transport: 'stdio', command: cmd, args, env, enabled: current?.enabled }
    const updated: McpConfig = { servers: { ...mcpConfig.servers, [editingId]: server } }
    try {
      if (
        current?.auth === 'oauth' &&
        current.url &&
        (server.auth !== 'oauth' || server.url !== current.url)
      ) {
        await invoke('mcp_oauth_clear', { serverId: editingId, url: current.url }).catch(() => {})
      }
      await invoke('mcp_save_config', { config: updated })
      setMcpConfig(updated)
      setEditingId(null)
      setNewTransport('stdio')
      setNewAuth('none')
      setNewScopes('')
      setNewCmd('')
      setNewArgs('')
      setNewEnv('')
    } catch (e) {
      setMcpError(`${e}`)
    }
  }, [editingId, newTransport, newAuth, newScopes, newCmd, newArgs, newEnv, mcpConfig])

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
        const isRemote = v.transport === 'streamable-http' || typeof v.url === 'string'
        if (!isRemote && typeof v.command !== 'string') continue
        if (isRemote && typeof v.url !== 'string') continue
        newServers[id] = {
          command: typeof v.command === 'string' ? v.command : undefined,
          args: Array.isArray(v.args) ? v.args.map(String) : [],
          env:
            typeof v.env === 'object' && v.env !== null
              ? Object.fromEntries(
                  Object.entries(v.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
                )
              : {},
          transport: isRemote ? 'streamable-http' : 'stdio',
          url: isRemote ? String(v.url) : undefined,
          auth: v.auth === 'oauth' ? 'oauth' : 'none',
          oauthScopes: Array.isArray(v.oauthScopes) ? v.oauthScopes.map(String) : [],
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
    setNewTransport('stdio')
    setNewAuth('none')
    setNewScopes('')
    setNewCmd('')
    setNewArgs('')
    setNewEnv('')
    setJsonText('')
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave({ ...draft, agentRuntime: 'native' })
      onClose()
    } finally {
      setSaving(false)
    }
  }, [draft, onSave, onClose])

  if (!open) return null

  const isOllama = draft.provider === 'ollama'
  const isAnthropic = draft.provider === 'anthropic'
  const isCcSwitchCodex = draft.provider === 'ccswitch'
  const isCcSwitchClaude = draft.provider === 'ccswitch_claude'
  const isOpenAiCompat = !isOllama && !isAnthropic && !isCcSwitchCodex && !isCcSwitchClaude
  const selectCcSwitchCodex = () =>
    setDraft((d) => ({
      ...d,
      provider: 'ccswitch',
      agentRuntime: 'native',
      openaiBaseUrl:
        !d.openaiBaseUrl.trim() || d.openaiBaseUrl === defaultSettings.openaiBaseUrl
          ? CCSWITCH_BASE_URL
          : d.openaiBaseUrl,
      openaiModel: d.openaiModel.trim() ? d.openaiModel : CCSWITCH_CODEX_DEFAULT_MODEL,
      openaiApiKey: '',
    }))
  const selectCcSwitchClaude = () =>
    setDraft((d) => ({
      ...d,
      provider: 'ccswitch_claude',
      agentRuntime: 'native',
      anthropicBaseUrl:
        !d.anthropicBaseUrl.trim() || d.anthropicBaseUrl === defaultSettings.anthropicBaseUrl
          ? CCSWITCH_BASE_URL
          : d.anthropicBaseUrl,
      anthropicModel: d.anthropicModel.trim() ? d.anthropicModel : CCSWITCH_CLAUDE_DEFAULT_MODEL,
      anthropicApiKey: '',
    }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div
        className={`relative z-10 w-full rounded-xl border border-border bg-card shadow-2xl ${
          tab === 'diagnostics' ? 'flex max-h-[88vh] max-w-3xl flex-col' : 'max-w-md'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">{t('settings.title')}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border px-5">
          <TabButton
            active={tab === 'model'}
            icon={<Bot className="h-3.5 w-3.5" />}
            label={t('settings.tabModel')}
            onClick={() => setTab('model')}
          />
          <TabButton
            active={tab === 'mcp'}
            icon={<Plug className="h-3.5 w-3.5" />}
            label={t('settings.tabMcp')}
            onClick={() => setTab('mcp')}
          />
          <TabButton
            active={tab === 'general'}
            icon={<Globe className="h-3.5 w-3.5" />}
            label={t('settings.tabGeneral')}
            onClick={() => setTab('general')}
          />
          <TabButton
            active={tab === 'diagnostics'}
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Trace"
            onClick={() => setTab('diagnostics')}
          />
        </div>

        {/* Body */}
        <div
          className={
            tab === 'diagnostics'
              ? 'min-h-0 flex-1 px-5 py-4'
              : 'max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4'
          }
        >
          {tab === 'model' ? (
            <>
              {/* Provider selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  {t('settings.providerLabel')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <ProviderTab
                    active={isOllama}
                    icon={<Server className="h-4 w-4" />}
                    label="Ollama"
                    onClick={() => setDraft((d) => ({ ...d, provider: 'ollama' }))}
                  />
                  <ProviderTab
                    active={isCcSwitchCodex}
                    icon={<Plug className="h-4 w-4" />}
                    label="CC Codex"
                    onClick={selectCcSwitchCodex}
                  />
                  <ProviderTab
                    active={isCcSwitchClaude}
                    icon={<Plug className="h-4 w-4" />}
                    label="CC Claude"
                    onClick={selectCcSwitchClaude}
                  />
                  <ProviderTab
                    active={isOpenAiCompat}
                    icon={<Cloud className="h-4 w-4" />}
                    label={t('settings.openaiCompat')}
                    onClick={() => setDraft((d) => ({ ...d, provider: 'openai_compat' }))}
                  />
                  <ProviderTab
                    active={isAnthropic}
                    icon={<Cloud className="h-4 w-4" />}
                    label="Anthropic"
                    onClick={() =>
                      setDraft((d) => ({ ...d, provider: 'anthropic', agentRuntime: 'native' }))
                    }
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
                    onChange={(v) => setDraft((d) => ({ ...d, ollamaHost: v }))}
                  />
                  <Field
                    label={t('settings.modelName')}
                    value={draft.ollamaModel}
                    placeholder="qwen2.5:7b"
                    onChange={(v) => setDraft((d) => ({ ...d, ollamaModel: v }))}
                  />
                </div>
              ) : isCcSwitchCodex ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                    <p className="text-xs font-medium text-foreground">
                      {t('settings.ccswitchCodexTitle')}
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      {t('settings.ccswitchCodexHint')}
                    </p>
                  </div>
                  <Field
                    label={t('settings.baseUrl')}
                    value={draft.openaiBaseUrl}
                    placeholder={CCSWITCH_BASE_URL}
                    onChange={(v) => setDraft((d) => ({ ...d, openaiBaseUrl: v }))}
                  />
                  <Field
                    label={t('settings.modelName')}
                    value={draft.openaiModel}
                    placeholder={CCSWITCH_CODEX_DEFAULT_MODEL}
                    onChange={(v) => setDraft((d) => ({ ...d, openaiModel: v }))}
                  />
                  <p className="text-[10px] text-muted-foreground/70">
                    {t('settings.ccswitchAuthHint')}
                  </p>
                </div>
              ) : isCcSwitchClaude ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                    <p className="text-xs font-medium text-foreground">
                      {t('settings.ccswitchClaudeTitle')}
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      {t('settings.ccswitchClaudeHint')}
                    </p>
                  </div>
                  <Field
                    label={t('settings.baseUrl')}
                    value={draft.anthropicBaseUrl}
                    placeholder={CCSWITCH_BASE_URL}
                    onChange={(v) => setDraft((d) => ({ ...d, anthropicBaseUrl: v }))}
                  />
                  <Field
                    label={t('settings.modelName')}
                    value={draft.anthropicModel}
                    placeholder={CCSWITCH_CLAUDE_DEFAULT_MODEL}
                    onChange={(v) => setDraft((d) => ({ ...d, anthropicModel: v }))}
                  />
                  <p className="text-[10px] text-muted-foreground/70">
                    {t('settings.ccswitchAuthHint')}
                  </p>
                </div>
              ) : isAnthropic ? (
                <div className="space-y-3">
                  <Field
                    label={t('settings.baseUrl')}
                    value={draft.anthropicBaseUrl}
                    placeholder="https://api.anthropic.com"
                    onChange={(v) => setDraft((d) => ({ ...d, anthropicBaseUrl: v }))}
                  />
                  <Field
                    label="API Key"
                    value={draft.anthropicApiKey}
                    placeholder={
                      draft.hasAnthropicApiKey ? 'Stored securely — enter to replace' : 'sk-ant-...'
                    }
                    type="password"
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        anthropicApiKey: v,
                        hasAnthropicApiKey: d.hasAnthropicApiKey || v.length > 0,
                      }))
                    }
                  />
                  <Field
                    label={t('settings.modelName')}
                    value={draft.anthropicModel}
                    placeholder="claude-sonnet-4-6"
                    onChange={(v) => setDraft((d) => ({ ...d, anthropicModel: v }))}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <Field
                    label={t('settings.baseUrl')}
                    value={draft.openaiBaseUrl}
                    placeholder="https://api.openai.com/v1"
                    onChange={(v) => setDraft((d) => ({ ...d, openaiBaseUrl: v }))}
                  />
                  <Field
                    label="API Key"
                    value={draft.openaiApiKey}
                    placeholder={
                      draft.hasOpenaiApiKey ? 'Stored securely — enter to replace' : 'sk-...'
                    }
                    type="password"
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        openaiApiKey: v,
                        hasOpenaiApiKey: d.hasOpenaiApiKey || v.length > 0,
                      }))
                    }
                  />
                  <Field
                    label={t('settings.modelName')}
                    value={draft.openaiModel}
                    placeholder="gpt-4o-mini"
                    onChange={(v) => setDraft((d) => ({ ...d, openaiModel: v }))}
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
              {oauthFlow && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                  <p className="font-semibold text-foreground">OAuth 授权：{oauthFlow.serverId}</p>
                  <p className="mt-1 text-muted-foreground">
                    打开授权页。完成后，即使回环页面无法显示，也请复制浏览器地址栏中的完整回调 URL。
                  </p>
                  <a
                    href={oauthFlow.authorizationUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex break-all text-primary hover:underline"
                  >
                    打开 OAuth 授权页
                  </a>
                  <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                    Redirect: {oauthFlow.redirectUri}
                  </p>
                  <Textarea
                    value={oauthFlow.callbackUrl}
                    onChange={(event) =>
                      setOauthFlow((flow) =>
                        flow ? { ...flow, callbackUrl: event.target.value } : flow,
                      )
                    }
                    placeholder="http://127.0.0.1:8765/oauth/callback?code=...&state=..."
                    rows={3}
                    className="mt-2 resize-none bg-secondary font-mono text-[11px]"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOauthFlow(null)}>
                      取消
                    </Button>
                    <Button
                      size="sm"
                      disabled={!oauthFlow.callbackUrl.trim()}
                      onClick={() => void handleOAuthComplete()}
                    >
                      完成授权
                    </Button>
                  </div>
                </div>
              )}
              {/* Server list */}
              {Object.keys(mcpConfig.servers).length === 0 && !adding && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t('settings.mcpEmpty')}
                </p>
              )}
              {Object.entries(mcpConfig.servers).map(([id, cfg]) => {
                const isRunning = mcpRunning.includes(id)
                const health = mcpStatuses[id]
                const busy = mcpBusy[id] ?? false
                const failure = mcpFailures[id]
                const startTime = mcpStartTimes[id]
                const elapsedSeconds =
                  busy && startTime ? Math.max(0, Math.floor((mcpClock - startTime) / 1000)) : 0
                const isEditing = editingId === id
                const statusClass = failure
                  ? 'bg-red/15 text-red'
                  : busy
                    ? 'bg-yellow/15 text-yellow'
                    : isRunning
                      ? 'bg-green/15 text-green'
                      : 'bg-muted text-muted-foreground'
                const dotClass = failure
                  ? 'bg-red'
                  : isRunning
                    ? 'bg-green'
                    : 'bg-muted-foreground/50'

                if (isEditing) {
                  return (
                    <div
                      key={id}
                      className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 space-y-2.5"
                    >
                      <div className="text-xs font-semibold text-foreground">{id}</div>
                      <TransportPicker value={newTransport} onChange={setNewTransport} />
                      <Field
                        label={
                          newTransport === 'streamable-http'
                            ? 'MCP Endpoint URL'
                            : t('settings.mcpCommand')
                        }
                        value={newCmd}
                        placeholder={
                          newTransport === 'streamable-http' ? 'https://example.com/mcp' : 'npx'
                        }
                        onChange={setNewCmd}
                      />
                      {newTransport === 'streamable-http' && (
                        <OAuthFields
                          auth={newAuth}
                          scopes={newScopes}
                          onAuthChange={setNewAuth}
                          onScopesChange={setNewScopes}
                        />
                      )}
                      {newTransport === 'stdio' && (
                        <Field
                          label={t('settings.mcpArgs')}
                          value={newArgs}
                          placeholder="--yes @scope/mcp-server"
                          onChange={setNewArgs}
                        />
                      )}
                      {newTransport === 'stdio' && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            {t('settings.mcpEnv')}
                          </label>
                          <Textarea
                            value={newEnv}
                            placeholder={'KEY=value\nANOTHER_KEY=value'}
                            onChange={(e) => setNewEnv(e.target.value)}
                            rows={2}
                            className="resize-none bg-secondary font-mono text-sm"
                          />
                        </div>
                      )}
                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelForm}
                          className="h-7 text-[11px]"
                        >
                          {t('settings.cancel')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleMcpSaveEdit}
                          disabled={!newCmd.trim()}
                          className="h-7 text-[11px]"
                        >
                          {t('settings.save')}
                        </Button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={id}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{id}</span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusClass}`}
                        >
                          {busy ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                          )}
                          {failure
                            ? t('settings.mcpFailed')
                            : busy
                              ? `${t('settings.mcpStarting')} ${elapsedSeconds}s`
                              : isRunning
                                ? t('settings.mcpRunning')
                                : t('settings.mcpStopped')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleMcpEdit(id)}
                          disabled={busy}
                          className="text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          title={t('settings.mcpEdit')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {cfg.transport === 'streamable-http' && cfg.auth === 'oauth' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleOAuthStart(id, cfg)}
                            disabled={busy}
                            className="h-6 px-1.5 py-1 text-[10px] text-primary hover:bg-primary/10 disabled:opacity-50"
                            title="配置 OAuth 授权"
                          >
                            OAuth
                          </Button>
                        )}
                        {isRunning ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleMcpStop(id)}
                            disabled={busy}
                            className="text-red hover:bg-red/10 disabled:opacity-50"
                            title={t('settings.mcpStop')}
                          >
                            <Square className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleMcpStart(id)}
                            disabled={busy}
                            className="text-green hover:bg-green/10 disabled:opacity-50"
                            title={t('settings.mcpStart')}
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleMcpRemove(id)}
                          disabled={busy}
                          className="text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                          title={t('settings.mcpRemove')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {cfg.transport === 'streamable-http'
                        ? cfg.url
                        : `${cfg.command ?? ''} ${cfg.args.join(' ')}`}
                    </p>
                    {health && (
                      <p className="text-[10px] text-muted-foreground/70">
                        {health.transport} · {health.toolCount} tools · {health.state}
                      </p>
                    )}
                    {failure && (
                      <p className="rounded-md border border-red/20 bg-red/5 px-2 py-1 text-[10px] text-red">
                        {t('settings.mcpLastError')}: {failure}
                      </p>
                    )}
                    {busy && !failure && (
                      <p className="text-[10px] text-yellow/80">
                        {cfg.transport === 'streamable-http'
                          ? t('settings.mcpConnectingRemote')
                          : t('settings.mcpStartingProcess')}
                      </p>
                    )}
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
                    <label className="text-xs font-medium text-foreground">
                      {t('settings.mcpJsonImport')}
                    </label>
                    <Textarea
                      value={jsonText}
                      placeholder={
                        '{\n  "mcpServers": {\n    "server-id": {\n      "command": "npx",\n      "args": ["-y", "@scope/pkg"],\n      "env": { "KEY": "value" }\n    }\n  }\n}'
                      }
                      onChange={(e) => setJsonText(e.target.value)}
                      rows={8}
                      className="resize-none bg-secondary font-mono text-xs"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelForm}
                        className="h-7 text-[11px]"
                      >
                        {t('settings.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleJsonImport}
                        disabled={!jsonText.trim()}
                        className="h-7 text-[11px]"
                      >
                        {t('settings.mcpImport')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 space-y-2.5">
                    <Field
                      label={t('settings.mcpServerId')}
                      value={newId}
                      placeholder="my-server"
                      onChange={setNewId}
                    />
                    <TransportPicker value={newTransport} onChange={setNewTransport} />
                    <Field
                      label={
                        newTransport === 'streamable-http'
                          ? 'MCP Endpoint URL'
                          : t('settings.mcpCommand')
                      }
                      value={newCmd}
                      placeholder={
                        newTransport === 'streamable-http' ? 'https://example.com/mcp' : 'npx'
                      }
                      onChange={setNewCmd}
                    />
                    {newTransport === 'streamable-http' && (
                      <OAuthFields
                        auth={newAuth}
                        scopes={newScopes}
                        onAuthChange={setNewAuth}
                        onScopesChange={setNewScopes}
                      />
                    )}
                    {newTransport === 'stdio' && (
                      <Field
                        label={t('settings.mcpArgs')}
                        value={newArgs}
                        placeholder="--yes @scope/mcp-server"
                        onChange={setNewArgs}
                      />
                    )}
                    {newTransport === 'stdio' && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          {t('settings.mcpEnv')}
                        </label>
                        <Textarea
                          value={newEnv}
                          placeholder={'KEY=value\nANOTHER_KEY=value'}
                          onChange={(e) => setNewEnv(e.target.value)}
                          rows={2}
                          className="resize-none bg-secondary font-mono text-sm"
                        />
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelForm}
                        className="h-7 text-[11px]"
                      >
                        {t('settings.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleMcpAdd}
                        disabled={!newId.trim() || !newCmd.trim()}
                        className="h-7 text-[11px]"
                      >
                        {t('settings.mcpAdd')}
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAdding(true)
                      setJsonMode(false)
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-dashed px-3 py-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('settings.mcpAdd')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAdding(true)
                      setJsonMode(true)
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-lg border-dashed px-3 py-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                    title={t('settings.mcpJsonImport')}
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    JSON
                  </Button>
                </div>
              )}
            </div>
          ) : tab === 'diagnostics' ? (
            <div className="flex h-[min(68vh,620px)] min-h-0 flex-col gap-3">
              <div className="flex shrink-0 items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">Agent Trace</p>
                  <p className="text-[10px] text-muted-foreground">
                    Local SQLite keeps the latest 200 sessions with sensitive fields redacted.
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void loadTraceSessions()}
                    disabled={traceBusy}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${traceBusy ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void exportDiagnostics(selectedTraceRunId)}
                    disabled={traceBusy || !selectedTraceRunId}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title="Export selected session"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {traceError && (
                <div className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {traceError}
                </div>
              )}
              {traceExportPath && (
                <div className="shrink-0 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-primary">
                  Exported: <span className="break-all font-mono">{traceExportPath}</span>
                </div>
              )}
              {traceSessions.length === 0 ? (
                <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  No Agent sessions yet. Run a conversation and traces will appear here.
                </p>
              ) : (
                <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                    {traceSessions.map((session) => (
                      <Button
                        type="button"
                        variant="outline"
                        key={session.runId}
                        onClick={() => void loadTraceEvents(session.runId)}
                        className={`h-auto w-full justify-start rounded-lg px-3 py-2 text-left ${
                          selectedTraceRunId === session.runId
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-secondary/40 hover:bg-muted'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-foreground">
                              {session.goal || '(no goal)'}
                            </span>
                            <TraceStatusBadge status={session.status} />
                          </div>
                          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                            {session.runId}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {formatTraceTime(session.startedAt)} / {session.eventCount} events
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground/80">
                            {session.provider ?? 'provider?'} / {session.runtime ?? 'runtime?'} /{' '}
                            {session.promptTokens + session.completionTokens} tokens
                          </p>
                        </div>
                      </Button>
                    ))}
                  </div>
                  <div className="flex min-h-0 flex-col rounded-lg border border-border bg-secondary/40">
                    <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                      <span className="text-xs font-semibold text-foreground">Event preview</span>
                      <span className="text-[10px] text-muted-foreground">
                        {traceEvents.length} events
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                      {traceEvents.slice(-80).map((event, index) => (
                        <div
                          key={`${String(event.id ?? index)}`}
                          className="rounded-md bg-background/60 px-2 py-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-[10px] text-primary">
                              {String(event.type ?? 'unknown')}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {formatTraceTime(Number(event.timestamp ?? 0))}
                            </span>
                          </div>
                          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                            {summarizeTraceEvent(event)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void exportDiagnostics(null)}
                disabled={traceBusy}
                className="h-8 w-full shrink-0 text-xs"
              >
                Export latest 50-session diagnostics
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-xs font-semibold text-foreground">上下文与记忆</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  控制长对话的历史保留和压缩方式。
                </p>
                <div className="mt-3 space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">压缩策略</label>
                    <Select
                      value={draft.contextCompactionMode}
                      onValueChange={(value) =>
                        setDraft((d) => ({
                          ...d,
                          contextCompactionMode: value as ModelSettings['contextCompactionMode'],
                        }))
                      }
                    >
                      <SelectTrigger size="sm" className="w-full bg-secondary text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semantic">语义摘要（推荐）</SelectItem>
                        <SelectItem value="structured">本地结构化摘要</SelectItem>
                        <SelectItem value="recent">只保留最近上下文</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="最大轮次"
                      value={String(draft.contextMaxTurns)}
                      placeholder="100"
                      onChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          contextMaxTurns:
                            Number.parseInt(v, 10) || defaultSettings.contextMaxTurns,
                        }))
                      }
                    />
                    <Field
                      label="最大 KB"
                      value={String(Math.round(draft.contextMaxBytes / 1024))}
                      placeholder="512"
                      onChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          contextMaxBytes:
                            (Number.parseInt(v, 10) ||
                              Math.round(defaultSettings.contextMaxBytes / 1024)) * 1024,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">CC Switch 健康检查</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      检测本地代理、Codex/Claude provider 和 Base URL 配置。
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={ccHealthBusy}
                    onClick={() => void checkCcSwitchHealth()}
                    className="h-7 text-[11px]"
                  >
                    {ccHealthBusy ? '检测中…' : '检测'}
                  </Button>
                </div>
                {ccHealth && (
                  <div className="mt-3 space-y-1 rounded-md bg-background/60 p-2 text-[10px] text-muted-foreground">
                    <p className={ccHealth.reachable ? 'text-green' : 'text-destructive'}>
                      {ccHealth.message}
                    </p>
                    <p>Base URL: {ccHealth.baseUrl}</p>
                    <p>
                      Codex: {ccHealth.currentCodexProvider ?? '未选择'} /{' '}
                      {ccHealth.codexProxyEnabled ? 'Proxy 开' : 'Proxy 关'} /{' '}
                      {ccHealth.currentCodexHasBaseUrl ? 'Base URL OK' : '缺 Base URL'}
                    </p>
                    <p>
                      Claude: {ccHealth.currentClaudeProvider ?? '未选择'} /{' '}
                      {ccHealth.claudeProxyEnabled ? 'Proxy 开' : 'Proxy 关'} /{' '}
                      {ccHealth.currentClaudeHasBaseUrl ? 'Base URL OK' : '缺 Base URL'}
                    </p>
                  </div>
                )}
              </div>

              <Field
                label={t('settings.cesiumIonToken')}
                value={draft.cesiumIonToken}
                placeholder="eyJhbGciOi..."
                type="password"
                onChange={(v) => setDraft((d) => ({ ...d, cesiumIonToken: v }))}
              />
              <p className="text-[10px] text-muted-foreground/70">
                {t('settings.cesiumIonTokenHint')}
              </p>
              <Field
                label={t('settings.tiandituToken')}
                value={draft.tiandituToken}
                placeholder="your-tianditu-key"
                type="password"
                onChange={(v) => setDraft((d) => ({ ...d, tiandituToken: v }))}
              />
              <p className="text-[10px] text-muted-foreground/70">
                {t('settings.tiandituTokenHint')}
              </p>
              <Field
                label={t('settings.proxyUrl')}
                value={draft.proxyUrl}
                placeholder="http://127.0.0.1:10808"
                onChange={(v) => setDraft((d) => ({ ...d, proxyUrl: v }))}
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
          {tab !== 'mcp' && tab !== 'diagnostics' && (
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
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
      }`}
    >
      {icon}
      {label}
    </Button>
  )
}

function TabButton({
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
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={`h-auto rounded-none border-b-2 px-3 py-2 text-xs font-medium ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </Button>
  )
}

function TraceStatusBadge({ status }: { status: TraceSessionSummary['status'] }) {
  const className =
    status === 'completed'
      ? 'bg-green/15 text-green'
      : status === 'failed'
        ? 'bg-destructive/15 text-destructive'
        : status === 'cancelled'
          ? 'bg-yellow/15 text-yellow'
          : 'bg-primary/15 text-primary'
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`}>
      {status}
    </span>
  )
}

function formatTraceTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '-'
  return new Date(value).toLocaleString()
}

export function summarizeTraceEvent(event: Record<string, unknown>) {
  if (event.type === 'model.context.prepared') {
    const tools = event.tools as { count?: unknown } | undefined
    return `context: ${Array.isArray(event.history) ? event.history.length : 0} turns, ${
      tools?.count ?? 0
    } tools, suspect: ${event.suspectCount ?? 0}`
  }
  if (event.type === 'run.started' || event.type === 'run.continued') {
    const continuation = event.continuation
    if (
      continuation &&
      typeof continuation === 'object' &&
      'kind' in continuation &&
      (continuation as { kind?: unknown }).kind === 'replan'
    ) {
      const parentRunId = String((continuation as { parentRunId?: unknown }).parentRunId ?? '')
      const parentStepId = String((continuation as { parentStepId?: unknown }).parentStepId ?? '')
      const prefix = event.type === 'run.continued' ? 'run continued' : 'run continuation'
      return `${prefix}: replan ${parentRunId}${parentStepId ? `/${parentStepId}` : ''}`
    }
  }
  if (event.type === 'task.plan.created') {
    const plan = event.plan as { goal?: unknown; steps?: unknown } | undefined
    const steps = Array.isArray(plan?.steps) ? plan.steps.length : 0
    return `plan: ${String(plan?.goal ?? event.goal ?? '')}${steps ? ` (${steps} steps)` : ''}`
  }
  if (event.type === 'task.plan.approval_required') {
    return `plan approval: ${String(event.planId ?? '')}`
  }
  if (event.type === 'task.plan.steps_replanned') {
    const steps = Array.isArray(event.steps) ? event.steps.length : 0
    return `plan replanned: ${String(event.anchorStepId ?? '')}${steps ? ` (${steps} steps)` : ''}`
  }
  if (event.type === 'task.step.retry_requested') {
    return `step retry: ${String(event.stepId ?? '')}`
  }
  if (event.type === 'task.step.skipped') {
    return `step skipped: ${String(event.stepId ?? '')}`
  }
  if (event.type === 'task.step.replan_requested') {
    return `step replan: ${String(event.stepId ?? '')}`
  }
  if (event.type === 'task.step.tool_linked') {
    return `step tool: ${String(event.stepId ?? '')} <- ${String(event.toolCallId ?? '')}`
  }
  if (event.type === 'task.step.updated') {
    const artifacts = Array.isArray(event.artifactRefs) ? event.artifactRefs.length : 0
    return `step: ${String(event.stepId ?? '')} ${String(event.status ?? '')}${
      artifacts ? `, ${artifacts} artifacts` : ''
    }`
  }
  if (typeof event.goal === 'string') return event.goal
  const call = event.call
  if (call && typeof call === 'object' && 'name' in call) {
    return `tool: ${String((call as { name?: unknown }).name)}`
  }
  if (typeof event.callId === 'string') return `call: ${event.callId}`
  if (typeof event.text === 'string') return event.text
  if (typeof event.summary === 'string') return event.summary
  if (event.error && typeof event.error === 'object' && 'message' in event.error) {
    return `error: ${String((event.error as { message?: unknown }).message)}`
  }
  return String(event.id ?? '')
}

function TransportPicker({
  value,
  onChange,
}: {
  value: 'stdio' | 'streamable-http'
  onChange: (value: 'stdio' | 'streamable-http') => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
      {(['stdio', 'streamable-http'] as const).map((transport) => (
        <Button
          key={transport}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(transport)}
          className={`h-auto rounded px-2 py-1 text-[11px] font-medium ${
            value === transport
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {transport === 'stdio' ? 'Local stdio' : 'Streamable HTTP'}
        </Button>
      ))}
    </div>
  )
}

function OAuthFields({
  auth,
  scopes,
  onAuthChange,
  onScopesChange,
}: {
  auth: 'none' | 'oauth'
  scopes: string
  onAuthChange: (value: 'none' | 'oauth') => void
  onScopesChange: (value: string) => void
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-secondary/40 p-2">
      <div className="flex gap-1">
        {(['none', 'oauth'] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAuthChange(value)}
            className={`h-auto flex-1 rounded px-2 py-1 text-[11px] ${
              auth === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {value === 'none' ? 'No authentication' : 'OAuth 2.0 (PKCE)'}
          </Button>
        ))}
      </div>
      {auth === 'oauth' && (
        <Field
          label="OAuth scopes（空格分隔）"
          value={scopes}
          placeholder="openid profile"
          onChange={onScopesChange}
        />
      )}
    </div>
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
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 bg-secondary text-sm placeholder:text-muted-foreground/50"
      />
    </div>
  )
}
