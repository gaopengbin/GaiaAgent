import { AlertTriangle, CheckCircle2, FileArchive, PackageCheck } from 'lucide-react'
import type { PendingDeliverablesImportPreview } from '../hooks/useTauriAgent'
import { describeSceneDeliverablesIntegrityFailure } from '../agent/scene-deliverables-import-summary'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface DeliverablesImportDialogProps {
  preview: PendingDeliverablesImportPreview | null
  onCancel: () => void
  onConfirm: () => void
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value.toLocaleString('zh-CN')} bytes`
}

export function DeliverablesImportDialog({
  preview,
  onCancel,
  onConfirm,
}: DeliverablesImportDialogProps) {
  const integrity = preview?.integrity
  const hasIntegrityError = !!integrity && !integrity.passed
  const manifestItems = preview?.manifest?.items ?? []
  const failures = integrity?.failures ?? []

  return (
    <Dialog open={!!preview} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur">
        <div className="border-b border-border px-5 py-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <FileArchive className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base">导入成果包 ZIP</DialogTitle>
                <DialogDescription className="mt-1 truncate">
                  {preview?.fileName ?? '等待选择成果包'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {preview && (
          <div className="max-h-[68vh] space-y-4 overflow-y-auto px-5 py-4">
            <div
              className={
                hasIntegrityError
                  ? 'rounded-xl border border-destructive/30 bg-destructive/10 p-3'
                  : 'rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3'
              }
            >
              <div className="flex items-start gap-2">
                {hasIntegrityError ? (
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-emerald-500"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {hasIntegrityError ? '校验异常，建议确认来源后再导入' : '成果包已读取，可导入'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {preview.summary || '未发现成果清单或索引信息，将仅按 scene/scene.json 导入。'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card/70 p-3">
                <p className="text-[11px] text-muted-foreground">ZIP 大小</p>
                <p className="mt-1 text-sm font-semibold">{formatBytes(preview.fileSize)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card/70 p-3">
                <p className="text-[11px] text-muted-foreground">成果项</p>
                <p className="mt-1 text-sm font-semibold">
                  {preview.manifest?.counts.totalDeliverables ?? '未知'}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/70 p-3">
                <p className="text-[11px] text-muted-foreground">文件索引</p>
                <p className="mt-1 text-sm font-semibold">
                  {preview.packageIndex ? `${preview.packageIndex.fileCount} 个文件` : '未提供索引'}
                </p>
              </div>
            </div>

            {failures.length > 0 && (
              <section className="rounded-xl border border-destructive/25 bg-destructive/5 p-3">
                <h3 className="text-xs font-semibold text-destructive">异常文件</h3>
                <div className="mt-2 space-y-1.5">
                  {failures.slice(0, 8).map((failure) => (
                    <p
                      key={`${failure.path}:${failure.reason}`}
                      className="rounded-lg border border-destructive/20 bg-background/60 px-2 py-1.5 font-mono text-[11px] text-foreground"
                    >
                      {describeSceneDeliverablesIntegrityFailure(failure)}
                    </p>
                  ))}
                  {failures.length > 8 && (
                    <p className="text-xs text-muted-foreground">
                      另有 {failures.length - 8} 个异常未列出。
                    </p>
                  )}
                </div>
              </section>
            )}

            {manifestItems.length > 0 && (
              <section className="rounded-xl border border-border bg-card/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <PackageCheck className="size-4 text-primary" aria-hidden="true" />
                  <h3 className="text-xs font-semibold">包内成果预览</h3>
                </div>
                <div className="space-y-1.5">
                  {manifestItems.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background/55 px-2 py-1.5"
                    >
                      <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[9px]">
                        {item.format}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-xs">{item.label}</span>
                      <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">
                        {item.source}
                      </span>
                    </div>
                  ))}
                  {manifestItems.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      另有 {manifestItems.length - 10} 个成果项未列出。
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        <DialogFooter className="border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            type="button"
            variant={hasIntegrityError ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {hasIntegrityError ? '仍然导入' : '确认导入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
