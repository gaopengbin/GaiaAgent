import { describe, expect, it } from 'vitest'
import type { SceneState } from './types'
import {
  buildSceneDeliverablesPackageFiles,
  buildSceneDeliverablesPackageIndex,
  buildSceneDeliverablesZipBlob,
  readSceneDeliverablesPackageFromZip,
  readSceneExportPayloadFromDeliverablesZip,
  sha256Text,
} from './scene-deliverables-package'
import { sceneFromExportPayload } from './scene-export'

function sampleScene() {
  return {
    revision: 3,
    camera: { lon: 116.397, lat: 39.916, height: 1200 },
    layers: [],
    labels: [],
    activeObjectRef: null,
    recentObjectRefs: [],
    assets: {
      'asset:schools': {
        ref: 'asset:schools',
        id: 'schools',
        kind: 'asset',
        type: 'tabular',
        name: 'Schools / CSV',
        source: 'import',
        geometryType: 'point',
        featureCount: 1,
        crs: 'EPSG:4326',
        metadata: {
          renderData: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'School A' },
                geometry: { type: 'Point', coordinates: [116.1, 39.7] },
              },
            ],
          },
        },
      },
      'asset:schools-buffer': {
        ref: 'asset:schools-buffer',
        id: 'schools-buffer',
        kind: 'asset',
        type: 'analysis-result',
        name: 'Schools buffer',
        source: 'agent',
        geometryType: 'polygon',
        featureCount: 1,
        metadata: {
          analysisType: 'buffer',
          sourceAssetRef: 'asset:schools',
          distanceMeters: 500,
          renderData: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Buffer' },
                geometry: { type: 'Polygon', coordinates: [] },
              },
            ],
          },
        },
      },
    },
  } satisfies SceneState
}

function sampleReviewScene() {
  return {
    revision: 4,
    camera: null,
    layers: [],
    labels: [],
    activeObjectRef: null,
    recentObjectRefs: [],
    assets: {
      'asset:project-parcels-overlap-redlines': {
        ref: 'asset:project-parcels-overlap-redlines',
        id: 'project-parcels-overlap-redlines',
        kind: 'asset',
        type: 'analysis-result',
        name: 'Project parcel redline overlap screen',
        source: 'agent',
        geometryType: 'polygon',
        featureCount: 3,
        metadata: {
          analysisType: 'polygon_overlap_screen',
          screenType: 'vertex_or_edge_intersection',
          sourceAssetRef: 'asset:project-parcels',
          targetAssetRef: 'asset:redlines',
          totalCandidates: 3,
          riskLevelCounts: { low: 1, medium: 1, high: 1 },
          exactOverlay: false,
          renderData: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'A01', reviewStatus: 'pending' },
                geometry: { type: 'Polygon', coordinates: [] },
              },
              {
                type: 'Feature',
                properties: { name: 'B02', reviewStatus: 'confirmed' },
                geometry: { type: 'Polygon', coordinates: [] },
              },
              {
                type: 'Feature',
                properties: { name: 'C03', reviewStatus: 'excluded' },
                geometry: { type: 'Polygon', coordinates: [] },
              },
            ],
          },
        },
      },
    },
  } satisfies SceneState
}

describe('scene deliverables package', () => {
  it('builds package files for manifest, scene, report, geojson assets, and csv tables', () => {
    const files = buildSceneDeliverablesPackageFiles(
      'session-1',
      sampleScene(),
      '2026-07-04T00:00:00.000Z',
    )

    expect(files.map((file) => file.path)).toEqual([
      'README.md',
      'manifest.json',
      'scene/scene.json',
      'reports/analysis-report.md',
      'analysis/Schools-buffer.geojson',
      'tables/Schools-buffer.csv',
      'data/Schools-CSV.geojson',
      'tables/Schools-CSV.csv',
      'package/index.json',
    ])
    expect(files.find((file) => file.path === 'README.md')?.content).toContain('package/index.json')
    expect(files.find((file) => file.path === 'manifest.json')?.content).toContain(
      '"kind": "gaia-agent-deliverables"',
    )
    expect(files.find((file) => file.path === 'manifest.json')?.content).toContain(
      '缓冲半径：500 米',
    )
    expect(files.find((file) => file.path === 'data/Schools-CSV.geojson')?.content).toContain(
      '"assetRef": "asset:schools"',
    )
    expect(files.find((file) => file.path === 'tables/Schools-CSV.csv')?.content).toContain(
      'name,lon,lat',
    )
    expect(files.find((file) => file.path === 'tables/Schools-buffer.csv')?.content).toContain(
      'featureIndex,name',
    )
    const packageIndex = JSON.parse(
      files.find((file) => file.path === 'package/index.json')?.content ?? '{}',
    ) as ReturnType<typeof buildSceneDeliverablesPackageIndex>
    expect(packageIndex).toMatchObject({
      kind: 'gaia-agent-package-index',
      version: 1,
      fileCount: 8,
    })
    expect(packageIndex.totalBytes).toBeGreaterThan(0)
    expect(packageIndex.files.map((file) => file.path)).toEqual([
      'README.md',
      'manifest.json',
      'scene/scene.json',
      'reports/analysis-report.md',
      'analysis/Schools-buffer.geojson',
      'tables/Schools-buffer.csv',
      'data/Schools-CSV.geojson',
      'tables/Schools-CSV.csv',
    ])
  })

  it('adds natural-resource review summaries and attachments to package README', () => {
    const files = buildSceneDeliverablesPackageFiles(
      'session-review',
      sampleReviewScene(),
      '2026-07-04T00:00:00.000Z',
    )

    const readme = files.find((file) => file.path === 'README.md')?.content ?? ''

    expect(readme).toContain('## 业务复核摘要')
    expect(readme).toContain(
      '- Project parcel redline overlap screen：待复核 1 / 已确认 1 / 已排除 1；复核进度 2 / 3',
    )
    expect(readme).toContain('### 复核附件')
    expect(readme).toContain('GEOJSON：Project-parcel-redline-overlap-screen.geojson')
    expect(readme).toContain('CSV：Project-parcel-redline-overlap-screen.csv')
    expect(readme).toContain('复核状态：待复核 1 / 已确认 1 / 已排除 1')
  })

  it('builds a package index with byte sizes', () => {
    const index = buildSceneDeliverablesPackageIndex(
      [
        { path: 'README.md', content: 'hello', mimeType: 'text/markdown' },
        { path: 'data/city.geojson', content: '{"城市": true}', mimeType: 'application/geo+json' },
      ],
      '2026-07-04T00:00:00.000Z',
    )

    expect(index.fileCount).toBe(2)
    expect(index.totalBytes).toBeGreaterThan('hello'.length)
    expect(index.files[1]).toMatchObject({
      path: 'data/city.geojson',
      mimeType: 'application/geo+json',
    })
    expect(index.files[0].sha256).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('hashes text content with SHA-256', () => {
    expect(sha256Text('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('creates a zip blob from package files', async () => {
    const files = buildSceneDeliverablesPackageFiles(
      'session-1',
      sampleScene(),
      '2026-07-04T00:00:00.000Z',
    )

    const blob = await buildSceneDeliverablesZipBlob(files)
    const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer())

    expect(blob.type).toBe('application/zip')
    expect(Array.from(bytes)).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('reads the scene export payload back from a deliverables zip', async () => {
    const files = buildSceneDeliverablesPackageFiles(
      'session-1',
      sampleScene(),
      '2026-07-04T00:00:00.000Z',
    )
    const blob = await buildSceneDeliverablesZipBlob(files)

    const payload = await readSceneExportPayloadFromDeliverablesZip(blob)
    const scene = sceneFromExportPayload(payload)

    expect(scene?.revision).toBe(3)
    expect(scene?.assets['asset:schools']?.name).toBe('Schools / CSV')
  })

  it('reads package manifest diagnostics back from a deliverables zip', async () => {
    const files = buildSceneDeliverablesPackageFiles(
      'session-1',
      sampleScene(),
      '2026-07-04T00:00:00.000Z',
    )
    const blob = await buildSceneDeliverablesZipBlob(files)

    const result = await readSceneDeliverablesPackageFromZip(blob)

    expect(result.manifest?.counts).toMatchObject({
      totalDeliverables: 6,
      geojson: 2,
      csv: 2,
    })
    expect(result.manifest?.items.map((item) => item.format)).toContain('markdown')
    expect(result.packageIndex?.fileCount).toBe(8)
    expect(result.packageIndex?.files[0]).toHaveProperty('sha256')
    expect(result.integrity).toMatchObject({
      checked: true,
      passed: true,
      total: 8,
      verified: 8,
      failures: [],
    })
  })

  it('reports a checksum failure when an indexed file is modified', async () => {
    const files = buildSceneDeliverablesPackageFiles(
      'session-1',
      sampleScene(),
      '2026-07-04T00:00:00.000Z',
    )
    const dataFile = files.find((file) => file.path === 'data/Schools-CSV.geojson')
    if (!dataFile) throw new Error('missing test data file')
    dataFile.content = dataFile.content.replace('School A', 'School B')
    const blob = await buildSceneDeliverablesZipBlob(files)

    const result = await readSceneDeliverablesPackageFromZip(blob)

    expect(result.integrity?.passed).toBe(false)
    expect(result.integrity?.failures).toEqual([
      expect.objectContaining({
        path: 'data/Schools-CSV.geojson',
        reason: 'sha256',
      }),
    ])
  })

  it('reports a missing file from the package index', async () => {
    const files = buildSceneDeliverablesPackageFiles(
      'session-1',
      sampleScene(),
      '2026-07-04T00:00:00.000Z',
    ).filter((file) => file.path !== 'tables/Schools-CSV.csv')
    const blob = await buildSceneDeliverablesZipBlob(files)

    const result = await readSceneDeliverablesPackageFromZip(blob)

    expect(result.integrity?.passed).toBe(false)
    expect(result.integrity?.failures).toContainEqual({
      path: 'tables/Schools-CSV.csv',
      reason: 'missing',
    })
  })
})
