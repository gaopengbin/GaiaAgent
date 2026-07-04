import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const outDir = resolve('dist', 'sbom')
const cargoCommand = process.platform === 'win32' ? 'cargo.exe' : 'cargo'
const npmExecPath = process.env.npm_execpath

async function run(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  return stdout
}

async function writeJson(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
}

await mkdir(outDir, { recursive: true })

const npmSbom = npmExecPath
  ? await run(process.execPath, [
      npmExecPath,
      'sbom',
      '--omit',
      'dev',
      '--sbom-format',
      'cyclonedx',
      '--sbom-type',
      'application',
    ])
  : await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'sbom',
      '--omit',
      'dev',
      '--sbom-format',
      'cyclonedx',
      '--sbom-type',
      'application',
    ])
await writeJson(resolve(outDir, 'npm-cyclonedx.json'), npmSbom)

const cargoMetadata = await run(cargoCommand, [
  'metadata',
  '--manifest-path',
  'src-tauri/Cargo.toml',
  '--locked',
  '--format-version',
  '1',
])
await writeJson(resolve(outDir, 'cargo-metadata.json'), cargoMetadata)

console.log(`SBOM artifacts written to ${outDir}`)
