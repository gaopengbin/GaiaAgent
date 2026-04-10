import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { DisplayItem, PlanStep, ConnStatus, StepResult } from '../types'
import { uid } from '../lib/utils'
import { planFromGoal, executePlan, normalizeToolResult } from '../agent'
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
        await invoke('start_runtime')
        if (!mounted) return

        const [tools, settings] = await Promise.all([
          invoke<ToolSchema[]>('list_tools'),
          invoke<ModelSettings>('load_model_settings'),
        ])
        if (!mounted) return

        toolsRef.current = tools
        settingsRef.current = settings
        setStatus('connected')
        setStatusText(`已连接，${tools.length} 个工具就绪`)
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

      for (const serverId of runningServers) {
        try {
          const result = await invoke<{ tools: ToolSchema[] }>('mcp_list_tools', { serverId })
          for (const tool of (result.tools ?? [])) {
            newMap.set(tool.name, serverId)
            mcpTools.push(tool)
          }
        } catch (e) {
          console.error(`Failed to list tools for MCP server '${serverId}':`, e)
        }
      }

      mcpToolMapRef.current = newMap

      // Merge: bridge tools + MCP tools
      let bridgeTools: ToolSchema[] = []
      try {
        bridgeTools = await invoke<ToolSchema[]>('list_tools')
      } catch { /* runtime might not be up */ }

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
    setItems(prev => [...prev, userItem, { kind: 'thinking', id: thinkingId }])
    setStatusText('正在生成计划…')

    try {
      const historyMsgs = buildHistoryMessages(historyRef.current)
      const sceneCtx = formatSceneContext(sceneRef.current)

      console.time('[GaiaAgent] Plan generation')
      console.log(`[GaiaAgent] Tools: ${toolsRef.current.length}, History: ${historyMsgs.length} msgs`)
      const mcpNames = new Set(mcpToolMapRef.current.keys())
      const plan = await planFromGoal(
        text,
        toolsRef.current,
        historyMsgs,
        sceneCtx,
        settingsRef.current,
        // Stream reasoning tokens to ThinkingIndicator
        (delta) => {
          setItems(prev => prev.map(item => {
            if (item.kind !== 'thinking' || item.id !== thinkingId) return item
            return { ...item, text: (item.text ?? '') + delta }
          }))
        },
        mcpNames,
      )
      console.timeEnd('[GaiaAgent] Plan generation')
      console.log(`[GaiaAgent] Plan: ${plan.steps.length} steps, reply: ${!!plan.reply}`)

      // Mark thinking indicator as done (keep visible, collapsed)
      setItems(prev => prev.map(i =>
        i.id === thinkingId && i.kind === 'thinking'
          ? { ...i, done: true } : i
      ))

      if (plan.steps.length === 0) {
        const replyText = plan.reply || `无法为该请求生成计划：${text}`
        setItems(prev => [...prev, {
          kind: 'chat', id: uid(), role: 'agent',
          text: replyText,
        }])
        appendAssistantEntry(historyRef.current, plan, [])
        setIsBusy(false)
        setStatusText('完成')
        return
      }

      // Add plan card
      const planId = uid()
      const displaySteps: PlanStep[] = plan.steps.map(s => ({
        id: s.id, tool: s.tool, description: s.description, status: 'pending' as const,
      }))
      setItems(prev => [...prev, {
        kind: 'plan', id: planId, goal: plan.goal,
        steps: displaySteps, confirmed: true,
      }])
      setStatusText('正在执行计划…')

      // Clear bridge results for this plan
      bridgeResultsRef.current = new Map()

      // Execute plan — update UI on each step change
      await executePlan(plan, (step) => {
        if (step.status === 'running') {
          // Track active step for bridge event handler
          activeStepRef.current = { planId, stepId: step.id, tool: step.tool }
        }

        // Merge: prefer bridge result if available
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

        // NOTE: scene state is updated AFTER executePlan using bridge results
      }, callToolRouted)

      // Wait for bridge WS results to arrive (HTTP dispatch returns before bridge executes)
      await new Promise(r => setTimeout(r, 300))

      // Update scene state with bridge results (which contain real entityId/layerId)
      for (const step of plan.steps) {
        if (step.status !== 'done') continue
        const bk = `${planId}:${step.id}`
        const br = bridgeResultsRef.current.get(bk)
        const mergedStep = br ? { ...step, result: br } : step
        updateSceneState(sceneRef.current, mergedStep)
      }

      // Append assistant entry to conversation history (also use bridge results)
      for (const step of plan.steps) {
        const bk = `${planId}:${step.id}`
        const br = bridgeResultsRef.current.get(bk)
        if (br) step.result = br
      }
      appendAssistantEntry(historyRef.current, plan, plan.steps)

      // Summary
      const done = plan.steps.filter(s => s.status === 'done').length
      const failed = plan.steps.filter(s => s.status === 'failed').length
      let summary = `计划执行完毕：${done}/${plan.steps.length} 步成功`
      if (failed > 0) summary += `，${failed} 步失败`
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
