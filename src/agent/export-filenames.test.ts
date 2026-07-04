import { describe, expect, it } from 'vitest'
import {
  assetGeoJsonFilename,
  assetCsvFilename,
  deliverablesManifestFilename,
  deliverablesPackageFilename,
  filenameTimestamp,
  markdownReportFilename,
  safeFilenamePart,
} from './export-filenames'

describe('export filenames', () => {
  const exportedAt = '2026-07-03T12:00:00.000Z'

  it('normalizes timestamps for filenames', () => {
    expect(filenameTimestamp(exportedAt)).toBe('2026-07-03T12-00-00-000Z')
  })

  it('removes Windows-invalid filename characters while preserving useful text', () => {
    expect(safeFilenamePart(' 北京 / schools:buffer*500m? ')).toBe('北京-schools-buffer-500m')
  })

  it('falls back for empty or control-only names', () => {
    expect(safeFilenamePart('\n\t', 'fallback')).toBe('fallback')
  })

  it('builds Markdown report filenames', () => {
    expect(markdownReportFilename('session:1/path', exportedAt)).toBe(
      'gaiaagent-report-session-1-path-2026-07-03T12-00-00-000Z.md',
    )
  })

  it('builds deliverables manifest filenames', () => {
    expect(deliverablesManifestFilename('session:1/path', exportedAt)).toBe(
      'gaiaagent-deliverables-session-1-path-2026-07-03T12-00-00-000Z.json',
    )
  })

  it('builds deliverables package filenames', () => {
    expect(deliverablesPackageFilename('session:1/path', exportedAt)).toBe(
      'gaiaagent-deliverables-session-1-path-2026-07-03T12-00-00-000Z.zip',
    )
  })

  it('builds GeoJSON asset filenames', () => {
    expect(assetGeoJsonFilename('Schools | 500m buffer', exportedAt)).toBe(
      'Schools-500m-buffer-2026-07-03T12-00-00-000Z.geojson',
    )
  })

  it('builds CSV asset filenames', () => {
    expect(assetCsvFilename('Schools | CSV', exportedAt)).toBe(
      'Schools-CSV-2026-07-03T12-00-00-000Z.csv',
    )
  })
})
