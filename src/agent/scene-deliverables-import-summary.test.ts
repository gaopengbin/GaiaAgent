import { describe, expect, it } from 'vitest'
import {
  buildSceneDeliverablesImportSummary,
  buildSceneDeliverablesIntegrityWarning,
  describeSceneDeliverablesIntegrityFailure,
} from './scene-deliverables-import-summary'
import type { SceneDeliverablesPackageReadResult } from './scene-deliverables-package'

function samplePackageData(
  integrity: NonNullable<SceneDeliverablesPackageReadResult['integrity']>,
): Pick<SceneDeliverablesPackageReadResult, 'manifest' | 'packageIndex' | 'integrity'> {
  return {
    manifest: {
      kind: 'gaia-agent-deliverables',
      version: 1,
      sessionId: 'session-1',
      exportedAt: '2026-07-04T00:00:00.000Z',
      sceneRevision: 3,
      counts: {
        objects: 2,
        visibleObjects: 2,
        dataAssets: 1,
        analysisResults: 1,
        geojson: 2,
        csv: 1,
        totalDeliverables: 5,
      },
      items: [],
    },
    packageIndex: {
      kind: 'gaia-agent-package-index',
      version: 1,
      generatedAt: '2026-07-04T00:00:00.000Z',
      fileCount: 7,
      totalBytes: 12345,
      files: [],
    },
    integrity,
  }
}

describe('scene deliverables import summary', () => {
  it('summarizes package manifest, index, and passed integrity checks', () => {
    expect(
      buildSceneDeliverablesImportSummary(
        samplePackageData({
          checked: true,
          passed: true,
          total: 7,
          verified: 7,
          failures: [],
        }),
      ),
    ).toBe('包内成果 5 项，GeoJSON 2，CSV 1；文件 7 个，12,345 bytes；校验通过 7/7')
  })

  it('summarizes the first integrity failure inline', () => {
    expect(
      buildSceneDeliverablesImportSummary(
        samplePackageData({
          checked: true,
          passed: false,
          total: 7,
          verified: 6,
          failures: [{ path: 'data/Schools.geojson', reason: 'sha256' }],
        }),
      ),
    ).toBe(
      '包内成果 5 项，GeoJSON 2，CSV 1；文件 7 个，12,345 bytes；校验异常 1/7：data/Schools.geojson：SHA-256 不一致',
    )
  })

  it('builds a confirmation warning for unsafe package imports', () => {
    const warning = buildSceneDeliverablesIntegrityWarning(
      samplePackageData({
        checked: true,
        passed: false,
        total: 7,
        verified: 5,
        failures: [
          { path: 'tables/Schools.csv', reason: 'missing' },
          { path: 'manifest.json', reason: 'bytes', expected: 100, actual: 88 },
        ],
      }),
    )

    expect(warning).toContain('成果包校验异常')
    expect(warning).toContain('tables/Schools.csv：文件缺失')
    expect(warning).toContain('manifest.json：字节数不一致（期望 100，实际 88）')
  })

  it('does not warn when integrity checks pass', () => {
    expect(
      buildSceneDeliverablesIntegrityWarning(
        samplePackageData({
          checked: true,
          passed: true,
          total: 7,
          verified: 7,
          failures: [],
        }),
      ),
    ).toBeNull()
  })

  it('describes integrity failure reasons', () => {
    expect(
      describeSceneDeliverablesIntegrityFailure({ path: 'README.md', reason: 'missing' }),
    ).toBe('README.md：文件缺失')
  })
})
