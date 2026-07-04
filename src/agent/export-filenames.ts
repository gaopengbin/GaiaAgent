export function safeFilenamePart(value: string, fallback = 'export') {
  const withoutControlChars = Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character
    })
    .join('')
  return (
    withoutControlChars
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || fallback
  )
}

export function filenameTimestamp(exportedAt = new Date().toISOString()) {
  return exportedAt.replace(/[:.]/g, '-')
}

export function markdownReportFilename(sessionId: string, exportedAt = new Date().toISOString()) {
  return `gaiaagent-report-${safeFilenamePart(sessionId, 'session')}-${filenameTimestamp(exportedAt)}.md`
}

export function deliverablesManifestFilename(
  sessionId: string,
  exportedAt = new Date().toISOString(),
) {
  return `gaiaagent-deliverables-${safeFilenamePart(sessionId, 'session')}-${filenameTimestamp(exportedAt)}.json`
}

export function deliverablesPackageFilename(
  sessionId: string,
  exportedAt = new Date().toISOString(),
) {
  return `gaiaagent-deliverables-${safeFilenamePart(sessionId, 'session')}-${filenameTimestamp(exportedAt)}.zip`
}

export function assetGeoJsonFilename(assetNameOrId: string, exportedAt = new Date().toISOString()) {
  return `${safeFilenamePart(assetNameOrId, 'gaia-asset')}-${filenameTimestamp(exportedAt)}.geojson`
}

export function assetCsvFilename(assetNameOrId: string, exportedAt = new Date().toISOString()) {
  return `${safeFilenamePart(assetNameOrId, 'gaia-asset')}-${filenameTimestamp(exportedAt)}.csv`
}
