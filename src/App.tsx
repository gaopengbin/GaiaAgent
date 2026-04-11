import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { TopBar } from './components/TopBar'
import { CesiumViewer } from './components/CesiumViewer'
import { ChatPanel } from './components/ChatPanel'
import { SettingsDialog, defaultSettings, type ModelSettings } from './components/SettingsDialog'
import { useTauriAgent } from './hooks/useTauriAgent'
import { useBridgeWS } from './hooks/useBridgeWS'

export function App() {
  const agent = useTauriAgent()
  const [bridge, setBridge] = useState<unknown>(null)
  const bridgeRef = useRef<unknown>(null)
  const { status: bridgeStatus } = useBridgeWS(bridge)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelSettings, setModelSettings] = useState<ModelSettings>(defaultSettings)

  useEffect(() => {
    invoke<ModelSettings>('load_model_settings').then(s => setModelSettings(s)).catch(() => {})
  }, [])

  const handleSaveSettings = useCallback(async (s: ModelSettings) => {
    await invoke('save_model_settings', { settings: s })
    setModelSettings(s)
  }, [])

  const handleBridgeReady = useCallback((b: unknown) => {
    setBridge(b)
    bridgeRef.current = b
  }, [])

  const modelLabel = modelSettings.provider === 'ollama'
    ? `Ollama · ${modelSettings.ollamaModel}`
    : `OpenAI · ${modelSettings.openaiModel}`

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-secondary font-sans text-foreground">
      <TopBar
        agentStatus={agent.status}
        agentText={agent.statusText}
        bridgeStatus={bridgeStatus}
        modelLabel={modelLabel}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={modelSettings}
        onSave={handleSaveSettings}
      />
      <div className="flex flex-1 min-h-0 gap-2 overflow-hidden p-2 pt-2">
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <CesiumViewer onBridgeReady={handleBridgeReady} ionToken={modelSettings.cesiumIonToken} />
        </div>
        <div className="flex w-[380px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ChatPanel
            items={agent.items}
            isBusy={agent.isBusy}
            canSend={agent.status === 'connected'}
            onSend={agent.sendText}
            onConfirm={agent.confirmPlan}
            onCancel={agent.cancelPlan}
          />
        </div>
      </div>
    </div>
  )
}
