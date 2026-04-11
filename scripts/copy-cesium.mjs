/**
 * Copy Cesium static assets from node_modules to public/cesium.
 * Run via: node scripts/copy-cesium.mjs
 */
import { cpSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const src = resolve(root, 'node_modules/cesium/Build/Cesium')
const dest = resolve(root, 'public/cesium')

if (!existsSync(src)) {
  console.error('[copy-cesium] cesium package not found. Run npm install first.')
  process.exit(1)
}

mkdirSync(dest, { recursive: true })

const items = ['Cesium.js', 'Assets', 'Workers', 'ThirdParty', 'Widgets']
for (const item of items) {
  const from = resolve(src, item)
  const to = resolve(dest, item)
  if (!existsSync(from)) continue
  cpSync(from, to, { recursive: true })
  console.log(`  ${item}`)
}

console.log('[copy-cesium] done -> public/cesium/')
