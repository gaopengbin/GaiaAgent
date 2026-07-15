import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  lazy,
  Suspense,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { TopBar } from './components/TopBar'
import { CesiumViewer } from './components/CesiumViewer'
import { ChatPanel } from './components/ChatPanel'
import { BusinessExamplePanel } from './components/BusinessExamplePanel'
import { McpElicitationDialog } from './components/McpElicitationDialog'
import { defaultSettings, type ModelSettings } from './components/settings-model'
import { useTauriAgent } from './hooks/useTauriAgent'
import { useBridgeWS } from './hooks/useBridgeWS'
import { Button } from './components/ui/button'
import type { SpatialAsset } from './agent'
import { buildSceneObjectTaskLinks, type SceneObjectTaskLink } from './agent/scene-links'
import { useTheme } from './context/ThemeProvider'

const SettingsDialog = lazy(() =>
  import('./components/SettingsDialog').then((module) => ({ default: module.SettingsDialog })),
)
const ScenePanel = lazy(() =>
  import('./components/ScenePanel').then((module) => ({ default: module.ScenePanel })),
)
const DeliverablesImportDialog = lazy(() =>
  import('./components/DeliverablesImportDialog').then((module) => ({
    default: module.DeliverablesImportDialog,
  })),
)

export function App() {
  const agent = useTauriAgent()
  const { resolvedTheme } = useTheme()
  const updateAgentModelSettings = agent.updateModelSettings
  const refreshSceneState = agent.refreshSceneState
  const focusSceneObject = agent.focusSceneObject
  const [bridge, setBridge] = useState<unknown>(null)
  const bridgeRef = useRef<unknown>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem('gaia-chat-panel-width'))
    return Number.isFinite(saved) && saved >= 320 ? saved : 380
  })
  const { status: bridgeStatus } = useBridgeWS(bridge, agent.runtimePort)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelSettings, setModelSettings] = useState<ModelSettings>(defaultSettings)
  const [sidePanel, setSidePanel] = useState<'assistant' | 'scene' | 'example'>('assistant')
  const [highlightedTaskStep, setHighlightedTaskStep] = useState<{
    runId: string
    stepId: string
    sequence: number
  } | null>(null)
  const { replayCurrentSceneToBridge } = agent
  const sceneTaskLinks = useMemo(() => buildSceneObjectTaskLinks(agent.timeline), [agent.timeline])

  useEffect(() => {
    invoke<ModelSettings>('load_model_settings')
      .then((s) => {
        setModelSettings(s)
        updateAgentModelSettings(s)
      })
      .catch(() => {})
  }, [updateAgentModelSettings])

  const handleSaveSettings = useCallback(
    async (s: ModelSettings) => {
      const saved = await invoke<ModelSettings>('save_model_settings', { settings: s })
      setModelSettings(saved)
      updateAgentModelSettings(saved)
    },
    [updateAgentModelSettings],
  )

  const handleApprovalModeChange = useCallback(
    async (approvalMode: ModelSettings['approvalMode']) => {
      const saved = await invoke<ModelSettings>('save_model_settings', {
        settings: { ...modelSettings, approvalMode },
      })
      setModelSettings(saved)
      updateAgentModelSettings(saved)
    },
    [modelSettings, updateAgentModelSettings],
  )

  const handleBridgeReady = useCallback((b: unknown) => {
    setBridge(b)
    bridgeRef.current = b
  }, [])

  const handleOpenSceneObject = useCallback(
    async (asset: SpatialAsset) => {
      await focusSceneObject(asset)
      setSidePanel('scene')
      void refreshSceneState()
    },
    [focusSceneObject, refreshSceneState],
  )

  const handleOpenTaskStep = useCallback((link: SceneObjectTaskLink) => {
    setHighlightedTaskStep((current) => ({
      runId: link.runId,
      stepId: link.stepId,
      sequence: (current?.sequence ?? 0) + 1,
    }))
    setSidePanel('assistant')
  }, [])

  useEffect(() => {
    if (bridge) void replayCurrentSceneToBridge()
  }, [bridge, replayCurrentSceneToBridge])

  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const workspace = workspaceRef.current
    if (!workspace) return

    const resize = (pointerEvent: PointerEvent) => {
      const rect = workspace.getBoundingClientRect()
      const maxWidth = Math.max(340, Math.min(760, rect.width - 420))
      const nextWidth = Math.min(maxWidth, Math.max(320, rect.right - pointerEvent.clientX - 8))
      setChatWidth(nextWidth)
      window.localStorage.setItem('gaia-chat-panel-width', String(Math.round(nextWidth)))
    }
    const stop = (pointerEvent: PointerEvent) => {
      resize(pointerEvent)
      handle.releasePointerCapture(event.pointerId)
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }, [])

  const modelLabel =
    modelSettings.provider === 'ollama'
      ? `Ollama · ${modelSettings.ollamaModel}`
      : modelSettings.provider === 'anthropic'
        ? `Anthropic · ${modelSettings.anthropicModel}`
        : modelSettings.provider === 'ccswitch'
          ? `CC Switch Codex · ${modelSettings.openaiModel}`
          : modelSettings.provider === 'ccswitch_claude'
            ? `CC Switch Claude · ${modelSettings.anthropicModel}`
            : `OpenAI · ${modelSettings.openaiModel}`

  return (
    <div className="gaia-workspace-shell flex h-screen flex-col overflow-hidden font-sans text-foreground">
      <TopBar
        agentStatus={agent.status}
        agentText={agent.statusText}
        bridgeStatus={bridgeStatus}
        modelLabel={modelLabel}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            settings={modelSettings}
            onSave={handleSaveSettings}
          />
        </Suspense>
      )}
      <McpElicitationDialog />
      {agent.pendingDeliverablesImport && (
        <Suspense fallback={null}>
          <DeliverablesImportDialog
            preview={agent.pendingDeliverablesImport}
            onCancel={agent.cancelDeliverablesPackageImport}
            onConfirm={agent.confirmDeliverablesPackageImport}
          />
        </Suspense>
      )}
      <div ref={workspaceRef} className="relative flex min-h-0 flex-1 overflow-hidden p-2 pt-2">
        <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden="true">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,hsl(var(--primary)/0.12),transparent_28%),radial-gradient(circle_at_82%_78%,hsl(var(--primary)/0.09),transparent_34%)]" />
          <div className="gaia-workspace-grid absolute inset-0" />
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-[0_12px_42px_rgb(15_23_42/0.12)] dark:border-white/10 dark:shadow-[0_10px_40px_rgb(0_0_0/0.25)]">
          <CesiumViewer
            onBridgeReady={handleBridgeReady}
            ionToken={modelSettings.cesiumIonToken}
            theme={resolvedTheme}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          aria-label="调整对话面板宽度"
          title="拖拽调整对话面板宽度"
          onPointerDown={handleResizePointerDown}
          className="group relative mx-1 h-auto w-2 shrink-0 cursor-col-resize rounded-full p-0 hover:bg-transparent"
        >
          <span className="h-16 w-1 rounded-full bg-border/70 transition-colors group-hover:bg-primary/70 group-focus-visible:bg-primary" />
        </Button>
        <div
          className="relative flex shrink-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-[0_12px_42px_rgb(15_23_42/0.12)] dark:border-white/10 dark:shadow-[0_10px_40px_rgb(0_0_0/0.25)]"
          style={{ width: chatWidth }}
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-2 py-1.5">
            <Button
              type="button"
              size="sm"
              variant={sidePanel === 'assistant' ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-[11px]"
              onClick={() => setSidePanel('assistant')}
            >
              助手
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sidePanel === 'scene' ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setSidePanel('scene')
                void refreshSceneState()
              }}
            >
              场景
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sidePanel === 'example' ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-[11px]"
              onClick={() => setSidePanel('example')}
            >
              样例
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {sidePanel === 'assistant' ? (
              <ChatPanel
                timeline={agent.timeline}
                sessions={agent.sessions}
                currentSessionId={agent.currentSessionId}
                statusText={agent.statusText}
                approvalMode={modelSettings.approvalMode}
                activeSceneObject={
                  agent.sceneState.activeObjectRef
                    ? agent.sceneState.assets[agent.sceneState.activeObjectRef]
                    : null
                }
                recentSceneObjects={(agent.sceneState.recentObjectRefs ?? [])
                  .map((reference) => agent.sceneState.assets[reference])
                  .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))}
                sceneAssets={agent.sceneState.assets}
                isBusy={agent.isBusy}
                canSend={agent.status === 'connected'}
                onSend={agent.sendText}
                onConfirm={agent.confirmPlan}
                onCancel={agent.cancelPlan}
                onNewSession={agent.createSession}
                onSwitchSession={agent.switchSession}
                onDeleteSession={agent.deleteSession}
                onClearContext={agent.clearCurrentContext}
                onCompactContext={agent.compactCurrentContext}
                onApprovalModeChange={handleApprovalModeChange}
                onOpenSceneObject={handleOpenSceneObject}
                onExportDeliverablesPackage={agent.exportCurrentDeliverablesPackage}
                onRetryTaskStep={agent.retryTaskStep}
                onSkipTaskStep={agent.skipTaskStep}
                onReplanTaskStep={agent.replanTaskStep}
                onApplySandboxPatch={agent.applySandboxPatchAndStartMcp}
                highlightedTaskStep={highlightedTaskStep}
              />
            ) : sidePanel === 'scene' ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    正在加载场景面板…
                  </div>
                }
              >
                <ScenePanel
                  scene={agent.sceneState}
                  busy={agent.isBusy}
                  onRefresh={agent.refreshSceneState}
                  onSelect={agent.selectSceneObject}
                  onFocus={agent.focusSceneObject}
                  onHighlightFeature={agent.highlightSceneFeature}
                  onSetFeatureReviewStatus={agent.setFeatureReviewStatus}
                  onRename={agent.renameSceneObject}
                  onVisibilityChange={agent.setSceneObjectVisibility}
                  onLockChange={agent.setSceneObjectLocked}
                  onAddAssetToMap={agent.addAssetToMap}
                  onCreateBuffer={agent.createAssetBuffer}
                  onCreateNearest={agent.createNearestAnalysis}
                  onCreateSpatialJoin={agent.createSpatialJoinAnalysis}
                  onCreatePolygonOverlapScreen={agent.createPolygonOverlapScreen}
                  onMeasureAsset={agent.measureAsset}
                  onCreateAttributeFilter={agent.createAttributeFilterAnalysis}
                  onExportAssetGeoJson={agent.exportAssetGeoJson}
                  onExportAssetCsv={agent.exportAssetCsv}
                  onSetAllVisibility={agent.setAllSceneObjectsVisibility}
                  onClearAgentObjects={agent.clearAgentSceneObjects}
                  onClearScene={agent.clearCurrentScene}
                  onExportScene={agent.exportCurrentSceneJson}
                  onExportMarkdownReport={agent.exportCurrentSceneMarkdownReport}
                  onExportDeliverablesManifest={agent.exportCurrentDeliverablesManifest}
                  onExportDeliverablesPackage={agent.exportCurrentDeliverablesPackage}
                  onImportDeliverablesPackage={agent.importDeliverablesPackage}
                  onImportScene={agent.importSceneJson}
                  onImportGeoJson={agent.importGeoJsonFile}
                  onImportCsv={agent.importCsvFile}
                  onDelete={agent.deleteSceneObject}
                  onPlaybackControl={agent.controlScenePlayback}
                  taskLinks={sceneTaskLinks}
                  onOpenTaskStep={handleOpenTaskStep}
                />
              </Suspense>
            ) : (
              <BusinessExamplePanel
                sceneAssets={agent.sceneState.assets}
                isBusy={agent.isBusy}
                canSend={agent.status === 'connected'}
                onSend={agent.sendText}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
