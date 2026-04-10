import { copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'node_modules', 'cesium-mcp-bridge', 'dist', 'cesium-mcp-bridge.browser.global.js');
const dest = resolve(root, 'public', 'cesium-mcp-bridge.browser.global.js');

if (!existsSync(src)) {
  console.warn('[update-bridge] cesium-mcp-bridge not installed, skipping');
  process.exit(0);
}

copyFileSync(src, dest);
console.log('[update-bridge] cesium-mcp-bridge.browser.global.js updated');
