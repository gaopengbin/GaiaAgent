import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chmod } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const tauriConfig = JSON.parse(readFileSync(join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const runtimeTarget = `runtime-${appPackage.version}`
const resourceTargets = Object.values(tauriConfig.bundle?.resources ?? {})
if (
  tauriConfig.version !== appPackage.version ||
  !resourceTargets.includes(`${runtimeTarget}/bin/`) ||
  !resourceTargets.includes(`${runtimeTarget}/node_modules/`)
) {
  throw new Error(
    `Versioned runtime resources are out of sync: expected app ${appPackage.version} under ${runtimeTarget}`,
  )
}
const bundleRoot = join(repoRoot, 'src-tauri', 'runtime-bundle')
const lockPath = join(bundleRoot, 'package-lock.json')
const markerPath = join(bundleRoot, '.runtime-build.json')
const nodeModulesPath = join(bundleRoot, 'node_modules')
const runtimePackagePath = join(nodeModulesPath, 'cesium-mcp-runtime', 'package.json')
const webSearchPackagePath = join(nodeModulesPath, 'open-websearch', 'package.json')
const binDir = join(bundleRoot, 'bin')
const nodeFilename = process.platform === 'win32' ? 'node.exe' : 'node'
const bundledNodePath = join(binDir, nodeFilename)

const lockHash = createHash('sha256').update(readFileSync(lockPath)).digest('hex')
const marker = {
  lockHash,
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
}

let currentMarker = null
try {
  currentMarker = JSON.parse(readFileSync(markerPath, 'utf8'))
} catch {
  // A clean checkout has no generated runtime bundle yet.
}

const runtimeReady =
  existsSync(runtimePackagePath) &&
  existsSync(webSearchPackagePath) &&
  existsSync(bundledNodePath) &&
  JSON.stringify(currentMarker) === JSON.stringify(marker)

if (!runtimeReady) {
  mkdirSync(bundleRoot, { recursive: true })
  const npmCli = process.env.npm_execpath
  if (!npmCli) throw new Error('npm_execpath is unavailable; run this script through npm')
  execFileSync(
    process.execPath,
    [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: bundleRoot, stdio: 'inherit' },
  )

  mkdirSync(binDir, { recursive: true })
  copyFileSync(process.execPath, bundledNodePath)
  if (process.platform !== 'win32') await chmod(bundledNodePath, 0o755)
  writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`)
}

const runtimePackage = JSON.parse(readFileSync(runtimePackagePath, 'utf8'))
const webSearchPackage = JSON.parse(readFileSync(webSearchPackagePath, 'utf8'))
console.log(
  `[prepare-runtime] bundled Node ${process.version}, cesium-mcp-runtime ${runtimePackage.version}, and open-websearch ${webSearchPackage.version}`,
)
