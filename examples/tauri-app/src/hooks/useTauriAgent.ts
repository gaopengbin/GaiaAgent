import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { DisplayItem, PlanStep, ConnStatus } from '../types'
import type { ToolSchema, ModelSettings } from '../agent/types'
import { planFromGoal } from '../agent/planner'
import { executePlan } from '../agent/executor'

export function useTauriAgent() {
  const [items, setItems] = useState<DisplayItem[]>([])
  const [status, setStatus] = useState<ConnStatus>('connecting')
  const [statusText, setStatusText] = useState('正在启动 Cesium 运行时…')
  const [isBusy, setIsBusy] = useState(false)
  const contextRef = useRef<string | null>(null)
  const toolsRef = useRef<ToolSchema[]>([])
  const settingsRef = useRef<ModelSettings | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        await invoke('start_runtime')
        if (cancelled) return

        const [tools, settings] = await Promise.all([
          invoke<ToolSchema[]>('list_tools'),
          invoke<ModelSettings>('load_model_settings'),
        ])
        if (cancelled) return

        toolsRef.current = tools
        settingsRef.current = settings
        setStatus('connected')
        setStatusText(`已连接，${tools.length} 个工具就绪`)
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setStatusText(`启动失败: ${e}`)
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  const sendText = useCallback(async (text: string) => {
    if (isBusy || !settingsRef.current) return
    setIsBusy(true)

    const userItem: DisplayItem = { kind: 'chat', id: `user-${Date.now()}`, role: 'user', text }
    const thinkingId = `thinking-${Date.now()}`
    setItems(prev => [...prev, userItem, { kind: 'thinking', id: thinkingId }])
    setStatusText('正在生成计划…')

    try {
      const plan = await planFromGoal(
        text,
        toolsRef.current,
        contextRef.current,
        settingsRef.current,
      )

      // Mark thinking indicator as done
      setItems(prev => prev.map(i =>
        i.id === thinkingId && i.kind === 'thinking'
          ? { ...i, done: true } : i
      ))

      if (plan.steps.length === 0) {
        const replyItem: DisplayItem = {
          kind: 'chat', id: `reply-${Date.now()}`, role: 'agent',
          text: `无法为该请求生成计划：${text}`,
        }
        setItems(prev => [...prev, replyItem])
        setIsBusy(false)
        setStatusText('完成')
        return
      }

      // Add plan item
      const planId = `plan-${Date.now()}`
      const displaySteps: PlanStep[] = plan.steps.map(s => ({
        id: s.id,
        tool: s.tool,
        description: s.description,
        status: 'pending',
      }))
      const planItem: DisplayItem = {
        kind: 'plan', id: planId, goal: plan.goal,
        steps: displaySteps, confirmed: true,
      }
      setItems(prev => [...prev, planItem])
      setStatusText('正在执行计划…')

      // Execute plan
      await executePlan(plan, (step) => {
        setItems(prev => prev.map(item => {
          if (item.kind !== 'plan' || item.id !== planId) return item
          const steps = item.steps.map(s => s.id === step.id
            ? { ...s, status: step.status, error: step.error, result: step.result }
            : s,
          )
          return { ...item, steps }
        }))
        if (step.status === 'done' && step.result?.output) {
          contextRef.current = step.result.output.slice(0, 500)
        }
      })

      // Summary
      const done = plan.steps.filter(s => s.status === 'done').length
      const failed = plan.steps.filter(s => s.status === 'failed').length
      let summary = `计划执行完毕：${done}/${plan.steps.length} 步成功`
      if (failed > 0) summary += `，${failed} 步失败`
      const summaryItem: DisplayItem = {
        kind: 'chat', id: `reply-${Date.now()}`, role: 'agent', text: summary,
      }
      setItems(prev => [...prev, summaryItem])
      setStatusText('完成')
    } catch (e) {
      setItems(prev => prev.map(i =>
        i.id === thinkingId && i.kind === 'thinking'
          ? { ...i, done: true } : i
      ))
      const errItem: DisplayItem = {
        kind: 'chat', id: `err-${Date.now()}`, role: 'error', text: `错误: ${e}`,
      }
      setItems(prev => [...prev, errItem])
      setStatusText(`执行失败：${e}`)
    } finally {
      setIsBusy(false)
    }
  }, [isBusy])

  const confirmPlan = useCallback(() => { /* auto-confirmed */ }, [])
  const cancelPlan = useCallback(() => { /* TODO */ }, [])

  return { items, status, statusText, isBusy, sendText, confirmPlan, cancelPlan }
}
