import type {
  SceneDeliverablesPackageIntegrity,
  SceneDeliverablesPackageReadResult,
} from './scene-deliverables-package'

function formatNumber(value: number) {
  return value.toLocaleString('zh-CN')
}

function failureReasonLabel(
  reason: SceneDeliverablesPackageIntegrity['failures'][number]['reason'],
) {
  if (reason === 'missing') return '文件缺失'
  if (reason === 'bytes') return '字节数不一致'
  return 'SHA-256 不一致'
}

export function describeSceneDeliverablesIntegrityFailure(
  failure: SceneDeliverablesPackageIntegrity['failures'][number],
) {
  const detail =
    failure.expected !== undefined || failure.actual !== undefined
      ? `（期望 ${String(failure.expected ?? '-')}，实际 ${String(failure.actual ?? '-')}）`
      : ''
  return `${failure.path}：${failureReasonLabel(failure.reason)}${detail}`
}

export function buildSceneDeliverablesImportSummary(
  packageData: Pick<SceneDeliverablesPackageReadResult, 'manifest' | 'packageIndex' | 'integrity'>,
) {
  const segments: string[] = []

  if (packageData.manifest) {
    segments.push(
      `包内成果 ${packageData.manifest.counts.totalDeliverables} 项，GeoJSON ${packageData.manifest.counts.geojson}，CSV ${packageData.manifest.counts.csv}`,
    )
  }

  if (packageData.packageIndex) {
    segments.push(
      `文件 ${packageData.packageIndex.fileCount} 个，${formatNumber(packageData.packageIndex.totalBytes)} bytes`,
    )
  }

  if (packageData.integrity) {
    if (packageData.integrity.passed) {
      segments.push(`校验通过 ${packageData.integrity.verified}/${packageData.integrity.total}`)
    } else {
      const firstFailure = packageData.integrity.failures[0]
      const failureHint = firstFailure
        ? `：${describeSceneDeliverablesIntegrityFailure(firstFailure)}`
        : ''
      segments.push(
        `校验异常 ${packageData.integrity.failures.length}/${packageData.integrity.total}${failureHint}`,
      )
    }
  }

  return segments.join('；')
}

export function buildSceneDeliverablesIntegrityWarning(
  packageData: Pick<SceneDeliverablesPackageReadResult, 'manifest' | 'packageIndex' | 'integrity'>,
) {
  if (!packageData.integrity || packageData.integrity.passed) return null

  const summary = buildSceneDeliverablesImportSummary(packageData)
  const failures = packageData.integrity.failures
    .slice(0, 5)
    .map((failure) => `- ${describeSceneDeliverablesIntegrityFailure(failure)}`)
    .join('\n')
  const more =
    packageData.integrity.failures.length > 5
      ? `\n- 另有 ${packageData.integrity.failures.length - 5} 个异常未列出`
      : ''

  return [
    '成果包校验异常，可能被改动或导出不完整。是否仍然导入？',
    '',
    summary,
    '',
    '异常文件：',
    failures || '- 未提供异常明细',
    more,
  ]
    .filter(Boolean)
    .join('\n')
}
