import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { DisplayItem, PlanStep, ConnStatus, StepResult } from '../types'
import { uid } from '../lib/utils'
import { normalizeToolResult, executeReAct } from '../agent'
import {
  appendUserEntry,
  appendAssistantEntry,
  buildHistoryMessages,
  createSceneState,
  updateSceneState,
  formatSceneContext,
} from '../agent/history'
import type { ToolSchema, ModelSettings, ConversationEntry, SceneState } from '../agent'
import type { ToolCaller } from '../agent'
import {
  BRIDGE_TOOL_ERROR_EVENT,
  BRIDGE_TOOL_RESULT_EVENT,
  type BridgeToolErrorDetail,
  type BridgeToolResultDetail,
} from './useBridgeWS'

interface ActiveStep {
  planId: string
  stepId: number
  tool: string
}

export function useTauriAgent() {
  const [items, setItems] = useState<DisplayItem[]>([])
  const [status, setStatus] = useState<ConnStatus>('connecting')
  const [statusText, setStatusText] = useState('正在启动 Cesium 运行时…')
  const [isBusy, setIsBusy] = useState(false)
  const historyRef = useRef<ConversationEntry[]>([])
  const sceneRef = useRef<SceneState>(createSceneState())
  const toolsRef = useRef<ToolSchema[]>([])
  const settingsRef = useRef<ModelSettings | null>(null)
  const activeStepRef = useRef<ActiveStep | null>(null)
  const bridgeResultsRef = useRef<Map<string, NonNullable<StepResult>>>(new Map())
  const mcpToolMapRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    let mounted = true

    // --- Bridge event handlers: capture results from CesiumJS bridge ---
    const handleBridgeResult = (event: Event) => {
      if (!mounted) return
      const detail = (event as CustomEvent<BridgeToolResultDetail>).detail
      const active = activeStepRef.current
      if (!active || detail.method !== active.tool) return

      const normalized = normalizeToolResult(detail.result)
      if (!normalized.output && !normalized.image) return

      const key = `${active.planId}:${active.stepId}`
      bridgeResultsRef.current.set(key, normalized)

      // Update UI immediately with bridge result
      setItems(prev => prev.map(item => {
        if (item.kind !== 'plan' || item.id !== active.planId) return item
        return {
          ...item,
          steps: item.steps.map(s =>
            s.id === active.stepId ? { ...s, result: normalized } : s
          ),
        }
      }))
    }

    const handleBridgeError = (event: Event) => {
      if (!mounted) return
      const detail = (event as CustomEvent<BridgeToolErrorDetail>).detail
      const active = activeStepRef.current
      if (!active || detail.method !== active.tool) return

      const key = `${active.planId}:${active.stepId}`
      const result: StepResult = { output: detail.message }
      bridgeResultsRef.current.set(key, result)
    }

    window.addEventListener(BRIDGE_TOOL_RESULT_EVENT, handleBridgeResult as EventListener)
    window.addEventListener(BRIDGE_TOOL_ERROR_EVENT, handleBridgeError as EventListener)

    // --- Init: start runtime, load tools & settings ---
    async function init() {
      try {
        const [settings, mcpCfg] = await Promise.all([
          invoke<ModelSettings>('load_model_settings'),
          invoke<{ servers: Record<string, { command: string; args: string[]; env: Record<string, string>; enabled?: boolean }> }>('mcp_load_config').catch(() => ({ servers: {} })),
        ])
        if (!mounted) return
        settingsRef.current = settings

        // Detect if cesium-mcp-runtime is configured as an MCP server
        const hasCesiumMcp = Object.values(mcpCfg.servers).some(
          cfg => cfg.enabled && (cfg.args ?? []).some(a => a.includes('cesium-mcp-runtime'))
        )

        if (!hasCesiumMcp) {
          // Legacy path: start HTTP runtime
          console.log('[GaiaAgent] 使用 HTTP 模式启动 cesium-mcp-runtime')
          await invoke('start_runtime')
          if (!mounted) return
          const tools = await invoke<ToolSchema[]>('list_tools')
          if (!mounted) return
          toolsRef.current = tools
        } else {
          console.log('[GaiaAgent] 检测到 MCP 配置中的 cesium-mcp-runtime，跳过 HTTP 启动')
        }

        setStatus('connected')
        setStatusText(hasCesiumMcp ? '已连接 (MCP 模式)' : `已连接，${toolsRef.current.length} 个工具就绪`)

        // Auto-start MCP servers that were enabled last time
        const toStart = Object.entries(mcpCfg.servers).filter(([, cfg]) => cfg.enabled)
        if (toStart.length > 0) {
          const names = toStart.map(([id]) => id).join(', ')
          setStatusText(`启动 MCP: ${names}...`)
          console.log(`[GaiaAgent] Auto-starting ${toStart.length} MCP server(s): ${names}`)
          for (const [id, cfg] of toStart) {
            try {
              setStatusText(`启动 MCP: ${id}...`)
              window.dispatchEvent(new CustomEvent('mcp-server-starting', { detail: id }))
              await invoke('mcp_start_server', {
                serverId: id,
                command: cfg.command,
                args: cfg.args,
                env: Object.keys(cfg.env ?? {}).length > 0 ? cfg.env : null,
              })
              console.log(`[GaiaAgent] MCP '${id}' started`)
              window.dispatchEvent(new CustomEvent('mcp-server-started', { detail: id }))
            } catch (e) {
              console.error(`[GaiaAgent] MCP '${id}' auto-start failed:`, e)
              window.dispatchEvent(new CustomEvent('mcp-server-started', { detail: id }))
            }
          }
          // Refresh tools to include MCP tools
          await refreshMcpToolsInner()
          if (mounted) {
            const mcpCount = mcpToolMapRef.current.size
            const totalCount = toolsRef.current.length
            setStatusText(hasCesiumMcp
              ? `已连接 (MCP)，${totalCount} 个工具就绪`
              : `已连接，${totalCount} 个工具就绪 (${mcpCount} MCP)`)
          }
        }
      } catch (e) {
        if (!mounted) return
        setStatus('error')
        setStatusText(`启动失败: ${e}`)
      }
    }

    init()

    // --- Listen for MCP tool changes from SettingsDialog ---
    const handleMcpChanged = () => {
      refreshMcpToolsInner()
    }
    window.addEventListener('mcp-tools-changed', handleMcpChanged)

    return () => {
      mounted = false
      window.removeEventListener(BRIDGE_TOOL_RESULT_EVENT, handleBridgeResult as EventListener)
      window.removeEventListener(BRIDGE_TOOL_ERROR_EVENT, handleBridgeError as EventListener)
      window.removeEventListener('mcp-tools-changed', handleMcpChanged)
    }
  }, [])

  // Refresh MCP tools from all running servers
  const refreshMcpToolsInner = useCallback(async () => {
    try {
      const runningServers = await invoke<string[]>('mcp_list_servers')
      const newMap = new Map<string, string>()
      const mcpTools: ToolSchema[] = []
      let hasCesiumMcpRunning = false

      for (const serverId of runningServers) {
        try {
          const result = await invoke<{ tools: ToolSchema[] }>('mcp_list_tools', { serverId })
          for (const tool of (result.tools ?? [])) {
            newMap.set(tool.name, serverId)
            mcpTools.push(tool)
          }
          // Check if this MCP server provides cesium-like tools (bridge tools)
          if ((result.tools ?? []).some(t => ['flyTo', 'setBasemap', 'addEntity'].includes(t.name))) {
            hasCesiumMcpRunning = true
          }
        } catch (e) {
          console.error(`Failed to list tools for MCP server '${serverId}':`, e)
        }
      }

      mcpToolMapRef.current = newMap

      // Only fetch HTTP bridge tools if cesium is NOT running as MCP server
      let bridgeTools: ToolSchema[] = []
      if (!hasCesiumMcpRunning) {
        try {
          bridgeTools = await invoke<ToolSchema[]>('list_tools')
        } catch { /* runtime might not be up */ }
      }

      toolsRef.current = [...bridgeTools, ...mcpTools]
      setStatusText(`已连接，${toolsRef.current.length} 个工具就绪`)
    } catch (e) {
      console.error('Failed to refresh MCP tools:', e)
    }
  }, [])

  // Tool call router — MCP tools go to mcp_call_tool, others to bridge
  const callToolRouted: ToolCaller = useCallback(async (name, params) => {
    const mcpServer = mcpToolMapRef.current.get(name)
    if (mcpServer) {
      return invoke('mcp_call_tool', {
        serverId: mcpServer,
        toolName: name,
        arguments: params,
      })
    }
    // Auto-inject Tianditu token for setBasemap calls
    if (name === 'setBasemap' && settingsRef.current?.tiandituToken) {
      const basemap = (params as Record<string, unknown>).basemap
      if (typeof basemap === 'string' && basemap.includes('tianditu') && !(params as Record<string, unknown>).token) {
        params = { ...params, token: settingsRef.current.tiandituToken }
      }
    }
    return invoke('call_tool', { name, params })
  }, [])

  const sendText = useCallback(async (text: string) => {
    if (isBusy || !settingsRef.current) return
    setIsBusy(true)

    // Append user entry to conversation history
    appendUserEntry(historyRef.current, text)

    const userItem: DisplayItem = { kind: 'chat', id: uid(), role: 'user', text }
    const thinkingId = uid()
    const planId = uid()
    let planCreated = false
    setItems(prev => [...prev, userItem, { kind: 'thinking', id: thinkingId }])
    setStatusText('正在思考…')

    try {
      const historyMsgs = buildHistoryMessages(historyRef.current)
      const sceneCtx = formatSceneContext(sceneRef.current)
      const mcpNames = new Set(mcpToolMapRef.current.keys())

      // Clear bridge results for this plan
      bridgeResultsRef.current = new Map()

      console.time('[GaiaAgent:ReAct] Total')
      const { plan, allSteps, usage } = await executeReAct(
        text,
        toolsRef.current,
        historyMsgs,
        sceneCtx,
        settingsRef.current,
        {
          mcpToolNames: mcpNames,
          callTool: callToolRouted,

          // Stream reasoning tokens to ThinkingIndicator
          onThinking: (delta) => {
            setItems(prev => prev.map(item => {
              if (item.kind !== 'thinking' || item.id !== thinkingId) return item
              return { ...item, text: (item.text ?? '') + delta }
            }))
          },

          // New round starting — reactivate thinking indicator
          onRoundStart: (round) => {
            setStatusText(`Round ${round} — 正在思考…`)
            if (round > 1) {
              // Reset thinking indicator for new round
              setItems(prev => prev.map(item => {
                if (item.kind !== 'thinking' || item.id !== thinkingId) return item
                return { ...item, done: false, text: (item.text ?? '') + `\n\n── Round ${round} ──\n` }
              }))
            }
          },

          // Steps determined for a round — add to PlanCard
          onStepsReady: (round, steps) => {
            // Mark thinking indicator as done (collapsed) while executing
            setItems(prev => prev.map(i =>
              i.id === thinkingId && i.kind === 'thinking'
                ? { ...i, done: true } : i
            ))
            setStatusText(`Round ${round} — 正在执行…`)

            if (!planCreated) {
              // First round — create PlanCard
              planCreated = true
              const displaySteps: PlanStep[] = steps.map(s => ({
                id: s.id, tool: s.tool, description: s.description,
                status: 'pending' as const, round: s.round,
              }))
              setItems(prev => [...prev, {
                kind: 'plan', id: planId, goal: text,
                steps: displaySteps, confirmed: true,
              }])
            } else {
              // Subsequent rounds — append steps to existing PlanCard
              const newSteps: PlanStep[] = steps.map(s => ({
                id: s.id, tool: s.tool, description: s.description,
                status: 'pending' as const, round: s.round,
              }))
              setItems(prev => prev.map(item => {
                if (item.kind !== 'plan' || item.id !== planId) return item
                return { ...item, steps: [...item.steps, ...newSteps] }
              }))
            }
          },

          // Step status updated during execution
          onStepUpdate: (step) => {
            if (step.status === 'running') {
              activeStepRef.current = { planId, stepId: step.id, tool: step.tool }
            }

            const bridgeKey = `${planId}:${step.id}`
            const bridgeResult = bridgeResultsRef.current.get(bridgeKey)
            const finalResult = bridgeResult ?? step.result

            setItems(prev => prev.map(item => {
              if (item.kind !== 'plan' || item.id !== planId) return item
              return {
                ...item,
                steps: item.steps.map(s =>
                  s.id === step.id
                    ? { ...s, status: step.status, error: step.error, result: finalResult ?? s.result }
                    : s
                ),
              }
            }))
          },
        },
      )
      console.timeEnd('[GaiaAgent:ReAct] Total')

      // Mark thinking indicator as done
      setItems(prev => prev.map(i =>
        i.id === thinkingId && i.kind === 'thinking'
          ? { ...i, done: true } : i
      ))

      if (allSteps.length === 0) {
        // Pure conversational reply — append token info if available
        let replyText = plan.reply || `无法为该请求生成计划：${text}`
        if (usage.total.totalTokens > 0) {
          const t = usage.total
          replyText += `\n\n\`Token: ${t.totalTokens} (prompt ${t.promptTokens} + completion ${t.completionTokens})\``
        }
        setItems(prev => [...prev, {
          kind: 'chat', id: uid(), role: 'agent', text: replyText,
        }])
        appendAssistantEntry(historyRef.current, plan, [])
        setIsBusy(false)
        setStatusText('完成')
        return
      }

      // Wait briefly for any remaining bridge WS results, then update scene state.
      // Bridge tools return real results via HTTP (synchronous round-trip through WS),
      // so this is mainly for any late-arriving WS event notifications.
      await new Promise(r => setTimeout(r, 150))

      // Update scene state — prefer bridge WS result if available, otherwise use step result
      for (const step of allSteps) {
        if (step.status !== 'done') continue
        const bk = `${planId}:${step.id}`
        const br = bridgeResultsRef.current.get(bk)
        const mergedStep = br ? { ...step, result: br } : step
        updateSceneState(sceneRef.current, mergedStep)
      }

      // Merge bridge results into steps for history
      for (const step of allSteps) {
        const bk = `${planId}:${step.id}`
        const br = bridgeResultsRef.current.get(bk)
        if (br) step.result = br
      }
      appendAssistantEntry(historyRef.current, plan, allSteps)

      // Update PlanCard goal if LLM refined it
      if (plan.goal !== text) {
        setItems(prev => prev.map(item => {
          if (item.kind !== 'plan' || item.id !== planId) return item
          return { ...item, goal: plan.goal }
        }))
      }

      // Summary
      const done = allSteps.filter(s => s.status === 'done').length
      const failed = allSteps.filter(s => s.status === 'failed').length
      const rounds = allSteps.length > 0 ? Math.max(...allSteps.map(s => s.round ?? 1)) : 1
      let summary = `执行完毕：${done}/${allSteps.length} 步成功`
      if (failed > 0) summary += `，${failed} 步失败`
      if (rounds > 1) summary += `（${rounds} 轮）`
      if (plan.reply) summary += `\n${plan.reply}`
      if (usage.total.totalTokens > 0) {
        const t = usage.total
        let tokenLine = `Token: ${t.totalTokens} (P:${t.promptTokens} C:${t.completionTokens})`
        if (usage.rounds.length > 1) {
          tokenLine += ' ' + usage.rounds.map((r, i) =>
            `R${i + 1}:${r.usage?.totalTokens ?? 0}`
          ).join('|')
        }
        summary += `\n\`${tokenLine}\``
      }
      setItems(prev => [...prev, {
        kind: 'chat', id: uid(), role: 'agent', text: summary,
      }])
      setStatusText('完成')
    } catch (e) {
      setItems(prev => prev.map(i =>
        i.id === thinkingId && i.kind === 'thinking'
          ? { ...i, done: true } : i
      ))
      setItems(prev => [...prev, {
        kind: 'chat', id: uid(), role: 'error', text: `错误: ${e}`,
      }])
      setStatusText(`执行失败：${e}`)
    } finally {
      setIsBusy(false)
      activeStepRef.current = null
    }
  }, [isBusy])

  const confirmPlan = useCallback(() => { /* auto-confirmed */ }, [])
  const cancelPlan = useCallback(() => { /* TODO */ }, [])

  return { items, status, statusText, isBusy, sendText, confirmPlan, cancelPlan }
}
