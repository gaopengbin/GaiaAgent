import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ConnStatus } from '../types'

const RESOURCE_ACTIONS = new Set([
  'load3dTiles',
  'load3dGaussianSplat',
  'addGaussianSplat',
  'loadKml',
  'loadCzml',
  'addGeoJson',
  'addGeoJsonPrimitive',
  'loadImageryService',
  'loadTerrain',
  'addModel',
  'addBillboard',
])
const RESOURCE_KEYS = new Set(['url', 'uri', 'image', 'schemaUri'])

function isProxyableResource(value: string): boolean {
  const source = value.trim()
  return (
    /^https?:\/\//i.test(source) ||
    /^file:\/\//i.test(source) ||
    /^[a-z]:[\\/]/i.test(source) ||
    /^\\\\/.test(source) ||
    /^\//.test(source)
  )
}

async function proxyResourceValue(value: unknown, key?: string): Promise<unknown> {
  if (
    typeof value === 'string' &&
    key !== undefined &&
    RESOURCE_KEYS.has(key) &&
    isProxyableResource(value)
  ) {
    return invoke<string>('resource_proxy_url', { source: value })
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => proxyResourceValue(item)))
  }
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([childKey, childValue]) => [
        childKey,
        await proxyResourceValue(childValue, childKey),
      ]),
    )
    return Object.fromEntries(entries)
  }
  return value
}

async function proxyResourceParams(
  action: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!RESOURCE_ACTIONS.has(action)) return params
  return (await proxyResourceValue(params)) as Record<string, unknown>
}

const BRIDGE_SESSION = 'gaiaagent'
const RECONNECT_DELAY = 3000

export const BRIDGE_TOOL_RESULT_EVENT = 'gaia-bridge-tool-result'
export const BRIDGE_TOOL_ERROR_EVENT = 'gaia-bridge-tool-error'
export const BRIDGE_SCENE_SNAPSHOT_EVENT = 'gaia-bridge-scene-snapshot'

export interface BridgeToolResultDetail {
  callId?: string
  method: string
  params: Record<string, unknown>
  result: unknown
  snapshot: unknown
}

export interface BridgeToolErrorDetail {
  callId?: string
  method: string
  params: Record<string, unknown>
  message: string
}

export interface BridgeSceneSnapshotDetail {
  callId?: string
  basemap?: string
  snapshot: unknown
}

export function useBridgeWS(bridge: unknown, runtimePort: number | null): { status: ConnStatus } {
  const [status, setStatus] = useState<ConnStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!bridge || runtimePort === null) return
    let disposed = false
    setStatus('connecting')

    function connect() {
      if (disposed) return
      const ws = new WebSocket(`ws://127.0.0.1:${runtimePort}?session=${BRIDGE_SESSION}`)
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) return
        console.log('[bridge-ws] connected to', ws.url)
        setStatus('connected')
        ;(window as unknown as Record<string, unknown>).__bridgeWsStatus = 'connected'
        const snapshot = (bridge as { exportScene?: () => unknown }).exportScene?.()
        if (snapshot) {
          window.dispatchEvent(
            new CustomEvent<BridgeSceneSnapshotDetail>(BRIDGE_SCENE_SNAPSHOT_EVENT, {
              detail: { snapshot },
            }),
          )
        }
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

          const b = bridge as {
            execute: (arg: { action: string; params: Record<string, unknown> }) => Promise<unknown>
            exportScene: () => unknown
          }
          const rawParams = (msg.params ?? {}) as Record<string, unknown>
          const callId =
            typeof rawParams.__gaiaCallId === 'string' ? rawParams.__gaiaCallId : undefined
          const params = { ...rawParams }
          delete params.__gaiaCallId
          const executionParams = await proxyResourceParams(msg.method, params)
          console.log('[bridge-ws] calling bridge.execute:', msg.method, executionParams)
          const result = await b.execute({ action: msg.method, params: executionParams })
          const snapshot = b.exportScene()
          console.log('[bridge-ws] execute result:', JSON.stringify(result).slice(0, 200))

          if (msg.id !== undefined) {
            ws.send(JSON.stringify({ id: msg.id, result }))
          }
          window.dispatchEvent(
            new CustomEvent<BridgeToolResultDetail>(BRIDGE_TOOL_RESULT_EVENT, {
              detail: {
                method: msg.method,
                callId,
                params,
                result,
                snapshot,
              },
            }),
          )
          window.dispatchEvent(
            new CustomEvent<BridgeSceneSnapshotDetail>(BRIDGE_SCENE_SNAPSHOT_EVENT, {
              detail: {
                callId,
                basemap:
                  msg.method === 'setBasemap' && typeof params.basemap === 'string'
                    ? params.basemap
                    : undefined,
                snapshot,
              },
            }),
          )
          ;(window as unknown as Record<string, unknown>).__lastBridgeResult = {
            method: msg.method,
            result,
          }
        } catch (err) {
          console.error('[bridge-ws] execute error:', err)
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
          const message = err instanceof Error ? err.message : String(err)
          try {
            const original = JSON.parse(event.data as string) as {
              id?: unknown
              method?: string
              params?: Record<string, unknown>
            }
            if (original.id !== undefined) {
              ws.send(JSON.stringify({ id: original.id, error: { message } }))
            }
            window.dispatchEvent(
              new CustomEvent<BridgeToolErrorDetail>(BRIDGE_TOOL_ERROR_EVENT, {
                detail: {
                  method: typeof original.method === 'string' ? original.method : 'unknown',
                  callId:
                    typeof original.params?.__gaiaCallId === 'string'
                      ? original.params.__gaiaCallId
                      : undefined,
                  params: original.params ?? {},
                  message,
                },
              }),
            )
          } catch {
            /* ignore parse error */
          }
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
  }, [bridge, runtimePort])

  return { status }
}
