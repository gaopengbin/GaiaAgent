import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { parseElicitationForm } from '../mcp/elicitation'

interface McpElicitationEvent {
  id: string
  serverId: string
  request: {
    mode?: 'form' | 'url'
    message?: string
    url?: string
    elicitationId?: string
    requestedSchema?: unknown
  }
}

export function McpElicitationDialog() {
  const [queue, setQueue] = useState<McpElicitationEvent[]>([])
  const [formValue, setFormValue] = useState('{}')
  const [error, setError] = useState<string | null>(null)
  const current = queue[0]
  const isForm = current?.request.mode !== 'url'

  useEffect(() => {
    let disposed = false
    const unlisten = listen<McpElicitationEvent>('mcp-elicitation', ({ payload }) => {
      if (disposed) return
      setQueue((items) =>
        items.some((item) => item.id === payload.id) ? items : [...items, payload],
      )
    }).catch(() => undefined)
    return () => {
      disposed = true
      void unlisten.then((dispose) => dispose?.())
    }
  }, [])

  useEffect(() => {
    setFormValue('{}')
    setError(null)
  }, [current?.id])

  const schemaPreview = current?.request.requestedSchema
    ? JSON.stringify(current.request.requestedSchema, null, 2)
    : null

  if (!current) return null

  const resolve = async (action: 'accept' | 'decline' | 'cancel') => {
    setError(null)
    let content: Record<string, unknown> | null = null
    if (action === 'accept' && isForm) {
      try {
        content = parseElicitationForm(formValue)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'JSON 格式无效。')
        return
      }
    }
    try {
      await invoke('mcp_resolve_elicitation', {
        elicitationId: current.id,
        action,
        content,
      })
      setQueue((items) => items.filter((item) => item.id !== current.id))
    } catch (reason) {
      setError(String(reason))
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-elicitation-title"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-yellow/15 p-2 text-yellow">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="mcp-elicitation-title" className="text-sm font-semibold text-foreground">
              MCP 服务请求用户输入
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              来源：{current.serverId}。服务提供的文字与链接均不可信，请勿填写密码、API Key
              或其他敏感信息。
            </p>
          </div>
        </div>

        <p className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
          {current.request.message || '该 MCP 服务请求额外输入。'}
        </p>

        {isForm ? (
          <div className="mt-3 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">JSON 响应</label>
            <Textarea
              value={formValue}
              onChange={(event) => setFormValue(event.target.value)}
              rows={6}
              className="resize-y bg-secondary font-mono text-xs"
            />
            {schemaPreview && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">查看服务声明的输入结构</summary>
                <pre className="mt-2 max-h-36 overflow-auto rounded bg-muted p-2">
                  {schemaPreview}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-border bg-secondary p-3">
            <p className="mb-2 break-all font-mono text-xs text-muted-foreground">
              {current.request.url}
            </p>
            <a
              href={current.request.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              在浏览器中打开 <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => void resolve('cancel')}>
            取消请求
          </Button>
          <Button variant="outline" size="sm" onClick={() => void resolve('decline')}>
            拒绝
          </Button>
          <Button size="sm" onClick={() => void resolve('accept')}>
            {isForm ? '提交给服务' : '已完成并继续'}
          </Button>
        </div>
      </div>
    </div>
  )
}
