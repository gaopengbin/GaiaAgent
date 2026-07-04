import { ListChecks, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SpatialAsset } from '../agent'
import {
  buildBusinessWorkflowPromptFromSelectedRefs,
  buildBusinessWorkflowSuggestions,
  businessWorkflowCompatibleAssets,
} from '../agent/business-workflows'
import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface BusinessExamplePanelProps {
  sceneAssets: Record<string, SpatialAsset>
  isBusy: boolean
  canSend: boolean
  onSend: (text: string) => void
}

const EXAMPLE_WORKFLOW_ID = 'natural-resource-compliance-screening'

export function BusinessExamplePanel({
  sceneAssets,
  isBusy,
  canSend,
  onSend,
}: BusinessExamplePanelProps) {
  const suggestion = useMemo(
    () =>
      buildBusinessWorkflowSuggestions(sceneAssets).find(
        (item) => item.template.id === EXAMPLE_WORKFLOW_ID,
      ),
    [sceneAssets],
  )
  const [assetSelections, setAssetSelections] = useState<Record<string, string>>({})

  if (!suggestion) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
        暂无可用业务样例。
      </div>
    )
  }

  const selectedAssetRefs = Object.fromEntries(
    suggestion.template.requiredAssets.map((requirement) => {
      const selected =
        assetSelections[requirement.role] ??
        suggestion.matchedAssets[requirement.role]?.ref ??
        '__none__'
      return [requirement.role, selected === '__none__' ? undefined : selected] as const
    }),
  )
  const missingRoles = suggestion.template.requiredAssets.filter(
    (requirement) => !selectedAssetRefs[requirement.role],
  )
  const canStartExample = missingRoles.length === 0
  const prompt = buildBusinessWorkflowPromptFromSelectedRefs(
    suggestion.template,
    sceneAssets,
    selectedAssetRefs,
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">业务样例</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              只保留一个自然资源合规初筛样例，用来演示业务闭环。
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{suggestion.template.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {suggestion.template.description}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] text-primary">
              样例
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {suggestion.template.requiredAssets.map((requirement) => {
              const compatibleAssets = businessWorkflowCompatibleAssets(
                sceneAssets,
                requirement.geometryType,
              )
              const value =
                assetSelections[requirement.role] ??
                suggestion.matchedAssets[requirement.role]?.ref ??
                '__none__'
              return (
                <div key={requirement.role} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-medium text-foreground">
                      {requirement.role}
                    </label>
                    <span className="text-[10px] text-muted-foreground">
                      {compatibleAssets.length > 0
                        ? `${compatibleAssets.length} 个可选`
                        : '暂无可分析资产'}
                    </span>
                  </div>
                  <Select
                    value={value}
                    disabled={isBusy || compatibleAssets.length === 0}
                    onValueChange={(assetRef) =>
                      setAssetSelections((current) => ({
                        ...current,
                        [requirement.role]: assetRef,
                      }))
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-8 border-border bg-background/70 text-xs"
                      title={requirement.description}
                    >
                      <SelectValue placeholder="选择资产" />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="__none__">尚未选择</SelectItem>
                      {compatibleAssets.map((asset) => (
                        <SelectItem key={asset.ref} value={asset.ref}>
                          <span className="block truncate">{asset.name || asset.id}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {compatibleAssets.length === 0 && (
                    <p className="text-[10px] leading-4 text-amber-200/80">
                      需要导入一个 {requirement.geometryType} GeoJSON/CSV 可分析资产。
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background/45 p-2.5 text-[11px] leading-5 text-muted-foreground">
            <p className="font-medium text-foreground">执行内容</p>
            <p className="mt-1">工具：{suggestion.template.analysisTools.join('、')}</p>
            <p className="mt-1">成果：{suggestion.template.reportFocus.slice(0, 4).join('、')}</p>
          </div>

          {!canStartExample && (
            <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-100/85">
              还缺少：{missingRoles.map((item) => item.role).join('、')}。请先在「场景」面板导入
              GeoJSON/CSV，或选择已有可分析资产。
            </p>
          )}

          <Button
            type="button"
            className="mt-4 w-full"
            disabled={isBusy || !canSend || !canStartExample}
            onClick={() => onSend(prompt)}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {canStartExample ? '开始样例分析' : '缺少样例数据'}
          </Button>
        </div>
      </div>
    </div>
  )
}
