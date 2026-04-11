import { useState, useEffect, useRef } from 'react'
import { ConnStatus } from '../types'

const BRIDGE_PORT = 9102
const BRIDGE_SESSION = 'gaiaagent'
const RECONNECT_DELAY = 3000

export const BRIDGE_TOOL_RESULT_EVENT = 'gaia-bridge-tool-result'
export const BRIDGE_TOOL_ERROR_EVENT = 'gaia-bridge-tool-error'

export interface BridgeToolResultDetail {
  method: string
  params: Record<string, unknown>
  result: unknown
}

export interface BridgeToolErrorDetail {
  method: string
  params: Record<string, unknown>
  message: string
}

export function useBridgeWS(bridge: unknown): { status: ConnStatus } {
  const [status, setStatus] = useState<ConnStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!bridge) return
    let disposed = false

    function connect() {
      if (disposed) return
      const ws = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}?session=${BRIDGE_SESSION}`)
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) return
        console.log('[bridge-ws] connected to', ws.url)
        setStatus('connected')
        ;(window as unknown as Record<string, unknown>).__bridgeWsStatus = 'connected'
      }

      ws.onmessage = async (event: MessageEvent) => {
        if (disposed) return
        try {
          const msg = JSON.parse(event.data as string)
          console.log('[bridge-ws] received msg:', JSON.stringify(msg).slice(0, 200))
          if (!msg.method) {
            console.warn('[bridge-ws] msg has no method field, keys:', Object.keys(msg))
            return
          }

          const b = bridge as { execute: (arg: { action: string; params: Record<string, unknown> }) => Promise<unknown> }
          console.log('[bridge-ws] calling bridge.execute:', msg.method, msg.params)
          const result = await b.execute({ action: msg.method, params: msg.params ?? {} })
          console.log('[bridge-ws] execute result:', JSON.stringify(result).slice(0, 200))

          if (msg.id !== undefined) {
            ws.send(JSON.stringify({ id: msg.id, result }))
          }
          window.dispatchEvent(new CustomEvent<BridgeToolResultDetail>(BRIDGE_TOOL_RESULT_EVENT, {
            detail: {
              method: msg.method,
              params: msg.params ?? {},
              result,
            },
          }))
          ;(window as unknown as Record<string, unknown>).__lastBridgeResult = { method: msg.method, result }
        } catch (err) {
          console.error('[bridge-ws] execute error:', err)
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
          const message = err instanceof Error ? err.message : String(err)
          try {
            const original = JSON.parse(event.data as string) as { id?: unknown; method?: string; params?: Record<string, unknown> }
            if (original.id !== undefined) {
              ws.send(JSON.stringify({ id: original.id, error: { message } }))
            }
            window.dispatchEvent(new CustomEvent<BridgeToolErrorDetail>(BRIDGE_TOOL_ERROR_EVENT, {
              detail: {
                method: typeof original.method === 'string' ? original.method : 'unknown',
                params: original.params ?? {},
                message,
              },
            }))
          } catch { /* ignore parse error */ }
        }
      }

      ws.onclose = (ev) => {
        console.log('[bridge-ws] closed code:', ev.code, 'reason:', ev.reason)
        if (disposed) return
        setStatus('disconnected')
        timerRef.current = setTimeout(connect, RECONNECT_DELAY)
      }

      ws.onerror = (ev) => {
        console.error('[bridge-ws] error:', ev)
        if (disposed) return
        setStatus('error')
      }
    }

    connect()

    return () => {
      disposed = true
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [bridge])

  return { status }
}
