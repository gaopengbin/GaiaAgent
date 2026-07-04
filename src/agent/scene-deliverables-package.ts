import type { SceneState, SpatialAsset } from './types'
import { buildSceneExportPayload } from './scene-export'
import { buildSceneMarkdownReport } from './scene-report'
import {
  buildSceneDeliverablesManifest,
  type SceneDeliverablesManifest,
} from './scene-deliverables'
import { geoJsonToCsv } from './geojson-csv'

export interface SceneDeliverablesPackageFile {
  path: string
  content: string
  mimeType: string
}

export interface SceneDeliverablesPackageIndex {
  kind: 'gaia-agent-package-index'
  version: 1
  generatedAt: string
  fileCount: number
  totalBytes: number
  files: Array<{
    path: string
    mimeType: string
    bytes: number
    sha256: string
  }>
}

export interface SceneDeliverablesPackageIntegrity {
  checked: boolean
  passed: boolean
  total: number
  verified: number
  failures: Array<{
    path: string
    reason: 'missing' | 'bytes' | 'sha256'
    expected?: string | number
    actual?: string | number
  }>
}

export interface SceneDeliverablesPackageReadResult {
  sceneExportPayload: unknown
  manifest?: SceneDeliverablesManifest
  packageIndex?: SceneDeliverablesPackageIndex
  integrity?: SceneDeliverablesPackageIntegrity
}

interface ZipEntryLike {
  filename: string
  getData?: (writer: unknown) => Promise<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isDeliverablesManifest(value: unknown): value is SceneDeliverablesManifest {
  return (
    isRecord(value) &&
    value.kind === 'gaia-agent-deliverables' &&
    value.version === 1 &&
    typeof value.sessionId === 'string' &&
    typeof value.exportedAt === 'string' &&
    typeof value.sceneRevision === 'number' &&
    isRecord(value.counts) &&
    Array.isArray(value.items)
  )
}

function isPackageIndex(value: unknown): value is SceneDeliverablesPackageIndex {
  return (
    isRecord(value) &&
    value.kind === 'gaia-agent-package-index' &&
    value.version === 1 &&
    typeof value.generatedAt === 'string' &&
    typeof value.fileCount === 'number' &&
    typeof value.totalBytes === 'number' &&
    Array.isArray(value.files)
  )
}

function assetDisplayName(asset: SpatialAsset) {
  return asset.name || asset.id || asset.ref
}

function textByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function rightRotate(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

export function sha256Text(value: string) {
  const bytes = new TextEncoder().encode(value)
  const bitLength = bytes.length * 8
  const paddedLength = ((bytes.length + 9 + 63) >> 6) << 6 || 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])
  const words = new Uint32Array(64)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4)
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rightRotate(words[index - 15], 7) ^
        rightRotate(words[index - 15], 18) ^
        (words[index - 15] >>> 3)
      const s1 =
        rightRotate(words[index - 2], 17) ^
        rightRotate(words[index - 2], 19) ^
        (words[index - 2] >>> 10)
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + choice + constants[index] + words[index]) >>> 0
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }

  const output = new Uint8Array(32)
  const outputView = new DataView(output.buffer)
  hash.forEach((word, index) => outputView.setUint32(index * 4, word))
  return bytesToHex(output)
}

function safePathPart(value: string, fallback = 'asset') {
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

function uniquePath(path: string, used: Set<string>) {
  if (!used.has(path)) {
    used.add(path)
    return path
  }
  const dotIndex = path.lastIndexOf('.')
  const prefix = dotIndex > 0 ? path.slice(0, dotIndex) : path
  const suffix = dotIndex > 0 ? path.slice(dotIndex) : ''
  let index = 2
  while (used.has(`${prefix}-${index}${suffix}`)) index += 1
  const nextPath = `${prefix}-${index}${suffix}`
  used.add(nextPath)
  return nextPath
}

function renderDataAsObject(asset: SpatialAsset) {
  const renderData = asset.metadata?.renderData
  return renderData && typeof renderData === 'object'
    ? (renderData as Record<string, unknown>)
    : undefined
}

function buildGeoJsonPayload(asset: SpatialAsset, exportedAt: string) {
  const renderData = renderDataAsObject(asset)
  if (!renderData) return undefined
  return {
    ...renderData,
    gaiaAgentExport: {
      kind: 'asset-geojson-export',
      app: 'GaiaAgent',
      assetRef: asset.ref,
      assetId: asset.id,
      assetName: assetDisplayName(asset),
      source: asset.source,
      crs: asset.crs,
      exportedAt,
    },
  }
}

function packageReviewSummaryLines(manifest: ReturnType<typeof buildSceneDeliverablesManifest>) {
  const seen = new Set<string>()
  const summaryLines: string[] = []
  const attachmentLines: string[] = []

  for (const item of manifest.items) {
    if (!item.reviewSummary) continue
    const key = item.assetRef ?? item.id
    if (!seen.has(key)) {
      seen.add(key)
      summaryLines.push(
        `- ${item.label.replace(/\s+(GeoJSON|CSV)$/u, '')}：${item.reviewSummary.label}；复核进度 ${item.reviewSummary.completed} / ${item.reviewSummary.total}`,
      )
    }
    attachmentLines.push(
      `  - ${item.format.toUpperCase()}：${item.filenameHint}（${item.description}）`,
    )
  }

  return summaryLines.length > 0
    ? ['## 业务复核摘要', '', ...summaryLines, '', '### 复核附件', '', ...attachmentLines, '']
    : []
}

function packageReadme(manifest: ReturnType<typeof buildSceneDeliverablesManifest>) {
  return [
    '# GaiaAgent 成果包',
    '',
    `- 会话 ID：${manifest.sessionId}`,
    `- 导出时间：${manifest.exportedAt}`,
    `- 场景版本：${manifest.sceneRevision}`,
    `- 成果项：${manifest.counts.totalDeliverables}`,
    `- GeoJSON：${manifest.counts.geojson}`,
    `- CSV：${manifest.counts.csv}`,
    '',
    '## 目录',
    '',
    '- `manifest.json`：成果清单与资产引用。',
    '- `package/index.json`：包内文件索引、MIME 类型和字节数。',
    '- `scene/scene.json`：可导入复现的场景 JSON。',
    '- `reports/analysis-report.md`：Markdown 分析报告。',
    '- `data/*.geojson`：数据资产 GeoJSON。',
    '- `analysis/*.geojson`：分析结果 GeoJSON。',
    '- `tables/*.csv`：点位资产或 GeoJSON 属性表 CSV。',
    '',
    ...packageReviewSummaryLines(manifest),
  ].join('\n')
}

export function buildSceneDeliverablesPackageIndex(
  files: SceneDeliverablesPackageFile[],
  generatedAt: string,
): SceneDeliverablesPackageIndex {
  const indexedFiles = files.map((file) => ({
    path: file.path,
    mimeType: file.mimeType,
    bytes: textByteLength(file.content),
    sha256: sha256Text(file.content),
  }))
  return {
    kind: 'gaia-agent-package-index',
    version: 1,
    generatedAt,
    fileCount: indexedFiles.length,
    totalBytes: indexedFiles.reduce((total, file) => total + file.bytes, 0),
    files: indexedFiles,
  }
}

export function buildSceneDeliverablesPackageFiles(
  sessionId: string,
  scene: SceneState,
  exportedAt: string,
): SceneDeliverablesPackageFile[] {
  const manifest = buildSceneDeliverablesManifest(sessionId, scene, exportedAt)
  const usedPaths = new Set<string>()
  const files: SceneDeliverablesPackageFile[] = []
  const addFile = (path: string, content: string, mimeType: string) => {
    files.push({ path: uniquePath(path, usedPaths), content, mimeType })
  }

  addFile('README.md', packageReadme(manifest), 'text/markdown;charset=utf-8')
  addFile('manifest.json', JSON.stringify(manifest, null, 2), 'application/json;charset=utf-8')
  addFile(
    'scene/scene.json',
    JSON.stringify(buildSceneExportPayload(sessionId, scene, exportedAt), null, 2),
    'application/json;charset=utf-8',
  )
  addFile(
    'reports/analysis-report.md',
    buildSceneMarkdownReport(sessionId, scene, exportedAt),
    'text/markdown;charset=utf-8',
  )

  const assets = Object.values(scene.assets).sort((left, right) =>
    (left.kind + left.type + assetDisplayName(left)).localeCompare(
      right.kind + right.type + assetDisplayName(right),
      'zh-CN',
    ),
  )

  for (const asset of assets) {
    if (asset.kind !== 'asset') continue
    const geoJsonPayload = buildGeoJsonPayload(asset, exportedAt)
    if (geoJsonPayload) {
      const folder =
        asset.type === 'analysis-result' || asset.metadata?.analysisType ? 'analysis' : 'data'
      addFile(
        `${folder}/${safePathPart(assetDisplayName(asset), asset.id)}.geojson`,
        JSON.stringify(geoJsonPayload, null, 2),
        'application/geo+json;charset=utf-8',
      )
    }

    const csv = geoJsonToCsv(asset.metadata?.renderData)
    if (csv) {
      addFile(
        `tables/${safePathPart(assetDisplayName(asset), asset.id)}.csv`,
        csv,
        'text/csv;charset=utf-8',
      )
    }
  }

  addFile(
    'package/index.json',
    JSON.stringify(buildSceneDeliverablesPackageIndex(files, exportedAt), null, 2),
    'application/json;charset=utf-8',
  )

  return files
}

export async function buildSceneDeliverablesZipBlob(
  files: SceneDeliverablesPackageFile[],
): Promise<Blob> {
  const { BlobWriter, TextReader, ZipWriter } = await import('@zip.js/zip.js')
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'))
  for (const file of files) {
    await zipWriter.add(file.path, new TextReader(file.content))
  }
  return zipWriter.close()
}

function findPackageEntry(entries: ZipEntryLike[], path: string) {
  const normalizedPath = path.toLowerCase()
  return (
    entries.find((entry) => entry.filename === path) ??
    entries.find((entry) => entry.filename.toLowerCase().endsWith(`/${normalizedPath}`)) ??
    entries.find((entry) => entry.filename.toLowerCase() === normalizedPath)
  )
}

async function readEntryText(
  entry: ZipEntryLike | undefined,
  writer: unknown,
  description: string,
) {
  if (!entry?.getData) {
    throw new Error(`ZIP package does not contain ${description}`)
  }
  return entry.getData(writer)
}

async function verifyPackageIndex(
  entries: ZipEntryLike[],
  packageIndex: SceneDeliverablesPackageIndex | undefined,
  createTextWriter: () => unknown,
): Promise<SceneDeliverablesPackageIntegrity | undefined> {
  if (!packageIndex) return undefined

  const failures: SceneDeliverablesPackageIntegrity['failures'] = []
  let verified = 0

  for (const indexedFile of packageIndex.files) {
    const entry = findPackageEntry(entries, indexedFile.path)
    if (!entry?.getData) {
      failures.push({ path: indexedFile.path, reason: 'missing' })
      continue
    }

    const text = await entry.getData(createTextWriter())
    const bytes = textByteLength(text)
    if (bytes !== indexedFile.bytes) {
      failures.push({
        path: indexedFile.path,
        reason: 'bytes',
        expected: indexedFile.bytes,
        actual: bytes,
      })
      continue
    }

    const sha256 = sha256Text(text)
    if (sha256 !== indexedFile.sha256) {
      failures.push({
        path: indexedFile.path,
        reason: 'sha256',
        expected: indexedFile.sha256,
        actual: sha256,
      })
      continue
    }

    verified += 1
  }

  return {
    checked: true,
    passed: failures.length === 0,
    total: packageIndex.files.length,
    verified,
    failures,
  }
}

export async function readSceneDeliverablesPackageFromZip(
  blob: Blob,
): Promise<SceneDeliverablesPackageReadResult> {
  const { BlobReader, TextWriter, ZipReader } = await import('@zip.js/zip.js')
  const zipReader = new ZipReader(new BlobReader(blob))
  try {
    const entries = (await zipReader.getEntries()) as ZipEntryLike[]
    const writer = new TextWriter()
    const sceneText = await readEntryText(
      findPackageEntry(entries, 'scene/scene.json') ?? findPackageEntry(entries, 'scene.json'),
      writer,
      'scene/scene.json',
    )
    const manifestEntry = findPackageEntry(entries, 'manifest.json')
    const manifest = manifestEntry?.getData
      ? JSON.parse(await manifestEntry.getData(new TextWriter()))
      : undefined
    const packageIndexEntry = findPackageEntry(entries, 'package/index.json')
    const packageIndex = packageIndexEntry?.getData
      ? JSON.parse(await packageIndexEntry.getData(new TextWriter()))
      : undefined
    const validPackageIndex = isPackageIndex(packageIndex) ? packageIndex : undefined
    return {
      sceneExportPayload: JSON.parse(sceneText),
      manifest: isDeliverablesManifest(manifest) ? manifest : undefined,
      packageIndex: validPackageIndex,
      integrity: await verifyPackageIndex(entries, validPackageIndex, () => new TextWriter()),
    }
  } finally {
    await zipReader.close()
  }
}

export async function readSceneExportPayloadFromDeliverablesZip(blob: Blob): Promise<unknown> {
  const result = await readSceneDeliverablesPackageFromZip(blob)
  return result.sceneExportPayload
}
